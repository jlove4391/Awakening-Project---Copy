#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `delegated-file-create-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = '.runtime-smoke/nexora-test.txt';
const targetContent = 'Nexora delegated file-create smoke passed.\n';
const timeoutMs = Number(process.env.SMOKE_DELEGATED_FILE_CREATE_TIMEOUT_MS || 30000);
const sessionId = `smoke-delegated-file-create-${Date.now()}`;

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';

await mkdir(path.join(workspaceRoot, '.runtime-smoke'), { recursive: true });

const { createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
await import('../src/tasks/queue.js');

console.log('Delegated file-create smoke: creating delegated Nexora task.');

const task = await createDelegatedTask({
  sessionId,
  objective: `Create ${targetPath} in the Nexora workspace.`,
  constraints: [
    `path: ${targetPath}`,
    `content: ${targetContent.trim()}`,
    'Do not delete or clean up the file unless cleanup is separately approved.',
    'Smoke workspace and task data are isolated under agent-runtime/.runtime-data/smoke/.',
  ],
  requiredTools: ['code.create_file'],
  authorizationSource: 'user_delegated',
  approvalRequirements: ['The direct user delegation is the authority basis for this ordinary file write.'],
  executionPlan: [
    {
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'file_write_requested_by_user' },
    },
  ],
  initialLog: 'Smoke task for delegated Nexora workspace file creation.',
});

assert.equal(task.status, 'queued', 'ordinary user-delegated file creation should queue without another approval prompt');
assert.equal(task.approvalRequirements[0]?.status, 'approved', 'direct user delegation should satisfy the task-level authority record');
assert.equal(task.executionPlan?.[0]?.approvalStatus, 'not_required', 'ordinary file-write step should not require step approval');
console.log(`✓ Created queued delegated task ${task.id} without a redundant task/step approval prompt.`);

const finalTask = await waitForTask(task.id, (candidate) => ['completed', 'failed', 'blocked'].includes(candidate.status));
console.log('✓ Worker executed ordinary file-write step without explicit step approval.');
assert.equal(finalTask.status, 'completed', `task should complete, got ${finalTask.status}: ${finalTask.result?.summary || finalTask.blockedReason || 'no result'}`);
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), `expected ${targetPath} to exist`);
assert.ok(finalTask.receipt, 'completed task should include a receipt');
assert.ok(finalTask.receipt?.id, 'completed task receipt should include an ID');
assert.ok(JSON.stringify(finalTask.result).includes('code.create_file'), 'completed result should include code.create_file execution proof');
console.log(`✓ Confirmed ${targetPath} exists, task completed, and receipt ${finalTask.receipt?.id} exists.`);
console.log('Delegated file-create smoke passed. Output intentionally remains under .runtime-data/smoke/.');

async function waitForTask(taskId: string, predicate: (task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) => boolean) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = await getDelegatedTask(taskId);
    if (candidate && predicate(candidate)) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out after ${timeoutMs}ms waiting for task ${taskId}. Latest status: ${latest?.status}; reason: ${latest?.blockedReason}; result: ${latest?.result?.summary}`);
}
