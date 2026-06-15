import { spawn } from 'node:child_process';
import { updateDelegatedTask } from '../../tasks/store.js';
import { evaluateNexoraCommandPolicy } from './sandboxPolicy.js';
import type { NexoraCommandLogChunk, NexoraCommandResult, NexoraExecutionRequest } from './types.js';

function now() {
  return new Date().toISOString();
}

function appendBounded(current: string, chunk: string, maxBytes: number) {
  const next = current + chunk;
  if (Buffer.byteLength(next, 'utf8') <= maxBytes) return next;
  return next.slice(Math.max(0, next.length - maxBytes));
}

export async function executeLocalNexoraCommand(request: NexoraExecutionRequest): Promise<NexoraCommandResult> {
  const policy = evaluateNexoraCommandPolicy(request);
  const startedAt = now();
  const started = Date.now();
  const logs: NexoraCommandLogChunk[] = [];
  const command = policy.normalizedCommand || request.command;
  const cwd = policy.cwd || '';

  if (!policy.ok || !policy.executable || !policy.cwd) {
    const result: NexoraCommandResult = {
      ok: false,
      status: 'blocked',
      taskId: request.taskId,
      command,
      cwd,
      exitCode: null,
      signal: null,
      startedAt,
      finishedAt: now(),
      durationMs: Date.now() - started,
      stdout: '',
      stderr: '',
      logs,
      policy,
      error: { message: policy.reason || 'policy_block' },
    };
    await updateDelegatedTask(request.taskId, {
      status: 'blocked',
      blockedReason: 'policy_block',
      log: `Nexora local worker blocked command by policy: ${policy.reason || 'policy_block'}`,
      result: { ok: false, summary: 'Nexora local worker blocked command by policy.', data: result, error: result.error },
    });
    return result;
  }

  await updateDelegatedTask(request.taskId, {
    log: `Nexora local worker starting bounded command in workspace: ${command}`,
    event: { type: 'task.log', actor: 'nexora', summary: 'Nexora local worker started command.', details: { command, cwd: policy.cwd } },
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const maxPerStream = Math.max(1_024, Math.floor((policy.maxOutputBytes || 200_000) / 2));
    const child = spawn(policy.executable!, policy.args || [], { cwd: policy.cwd, shell: false, env: process.env });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref();
    }, policy.timeoutMs).unref();

    const recordChunk = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stream === 'stdout') stdout = appendBounded(stdout, text, maxPerStream);
      else stderr = appendBounded(stderr, text, maxPerStream);
      const log = { stream, text: text.slice(0, 4_000), at: now() } satisfies NexoraCommandLogChunk;
      logs.push(log);
      void updateDelegatedTask(request.taskId, { log: `[${stream}] ${log.text}` });
    };

    child.stdout.on('data', (chunk: Buffer) => recordChunk('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => recordChunk('stderr', chunk));
    child.on('error', (error) => {
      stderr = appendBounded(stderr, error.message, maxPerStream);
    });
    child.on('close', async (exitCode, signal) => {
      clearTimeout(timeout);
      const finishedAt = now();
      const ok = !timedOut && exitCode === 0;
      const result: NexoraCommandResult = {
        ok,
        status: timedOut ? 'timed_out' : ok ? 'completed' : 'failed',
        taskId: request.taskId,
        command,
        cwd: policy.cwd!,
        exitCode,
        signal,
        startedAt,
        finishedAt,
        durationMs: Date.now() - started,
        stdout,
        stderr,
        logs,
        policy,
        ...(!ok ? { error: { message: timedOut ? `Command timed out after ${policy.timeoutMs}ms.` : `Command exited with code ${exitCode}.` } } : {}),
      };
      await updateDelegatedTask(request.taskId, {
        status: ok ? 'completed' : 'failed',
        result: {
          ok,
          summary: ok ? 'Nexora local worker completed bounded command.' : `Nexora local worker command ${result.status}.`,
          data: result,
          ...(result.error ? { error: result.error } : {}),
        },
        log: `Nexora local worker finished command with status ${result.status}.`,
      });
      resolve(result);
    });
  });
}
