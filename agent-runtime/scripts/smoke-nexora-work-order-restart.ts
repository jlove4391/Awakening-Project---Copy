#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `nexora-work-order-restart-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = 'src/restart-proof.txt';
const targetContent = 'This completed write must not be repeated after restart.\n';

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';

await mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
await writeFile(path.join(workspaceRoot, targetPath), targetContent);

const { createDelegatedTask, updateDelegatedTask } = await import('../src/tasks/store.js');
const { createNexoraWorkOrderForTask, transitionNexoraWorkOrder } = await import('../src/tasks/workOrders.js');

const task = await createDelegatedTask({
  sessionId: `restart-work-order-${Date.now()}`,
  objective: `Continue validating ${targetPath} after restart without repeating the completed file creation step.`,
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
  requiredTools: ['code.create_file', 'code.read'],
  constraints: [`Only inspect ${targetPath} after restart.`, 'Do not repeat completed mutations.'],
  executionPlan: [
    {
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      status: 'completed',
      resultSummary: 'File creation completed before the simulated restart.',
    },
    {
      targetTool: 'code.read',
      arguments: { path: targetPath },
      status: 'queued',
    },
  ],
});
const workOrder = await createNexoraWorkOrderForTask(task);
await transitionNexoraWorkOrder(task.id, 'running', { actor: 'nexora', summary: 'Simulated process interruption after the first persisted step completed.' });
await updateDelegatedTask(task.id, {
  status: 'running',
  log: 'Simulated runtime interruption with one completed step and one unfinished safe step.',
});

const verifierPath = path.join(runtimeRoot, 'scripts', 'verify-nexora-work-order-restart.ts');
const child = spawn(process.execPath, ['--import', 'tsx', verifierPath], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    RESTART_WORK_ORDER_TASK_ID: task.id,
    RESTART_WORK_ORDER_PATH: targetPath,
    RESTART_WORK_ORDER_CONTENT: targetContent,
  },
  stdio: 'inherit',
});

const exitCode = await new Promise<number | null>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', resolve);
});
assert.equal(exitCode, 0, `restart verifier exited with ${exitCode}`);
console.log(`✓ Fresh-process recovery preserved completed step state for work order ${workOrder.id}.`);
console.log('Nexora work-order restart smoke passed.');
