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

process.env.AGENT_RUNTIME_DATA_DIR = process.env.AGENT_RUNTIME_DATA_DIR || dataDir;
process.env.NEXORA_WORKSPACE_ROOT = process.env.NEXORA_WORKSPACE_ROOT || workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = process.env.NEXORA_ENABLE_WRITE_FILES || 'true';

await mkdir(path.join(process.env.NEXORA_WORKSPACE_ROOT, '.runtime-smoke'), { recursive: true });

const { approveDelegatedTask, approveExecutionPlanStep, createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
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
  approvalRequirements: ['Approve this delegated task before Nexora may request or use the file-write step.'],
  executionPlan: [
    {
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'file_write_approval_required' },
    },
  ],
  initialLog: 'Smoke task for delegated Nexora workspace file creation.',
});

assert.equal(task.status, 'queued', 'ordinary delegated file creation should queue without task approval');
assert.equal(task.approvalRequirements.length, 0, 'ordinary delegated file creation should not create task approval requirements');
assert.equal(task.executionPlan?.[0]?.approvalStatus, 'not_required', 'ordinary file-write step should not require step approval');
console.log(`✓ Created queued delegated task ${task.id} without task/step approvals.`);

const firstWorkerState = await waitForTask(task.id, (candidate) => candidate.status === 'completed' || candidate.status === 'failed' || candidate.status === 'blocked');
let finalTask = firstWorkerState;


  finalTask = await waitForTask(task.id, (candidate) => candidate.status === 'completed' || candidate.status === 'failed' || candidate.status === 'blocked');
} else {
  console.log('✓ Worker executed ordinary file-write step without explicit step approval.');
}
assert.equal(finalTask.status, 'completed', `task should complete, got ${finalTask.status}: ${finalTask.result?.summary || finalTask.blockedReason || 'no result'}`);
assert.ok(existsSync(path.join(process.env.NEXORA_WORKSPACE_ROOT, targetPath)), `expected ${targetPath} to exist`);
assert.ok(finalTask.receipt, 'completed task should include a receipt');
assert.ok(finalTask.receipt?.id, 'completed task receipt should include an ID');
assert.ok(JSON.stringify(finalTask.result).includes('code.create_file'), 'completed result should include code.create_file execution proof');
console.log(`✓ Confirmed ${targetPath} exists, task completed, and receipt ${finalTask.receipt?.id} exists.`);
console.log('Delegated file-create smoke passed. Output intentionally remains under .runtime-data/smoke/.');

async function waitForTask(taskId: string, predicate: (task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) => boolean) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await getDelegatedTask(taskId);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out after ${timeoutMs}ms waiting for task ${taskId}. Latest status: ${latest?.status}; reason: ${latest?.blockedReason}; result: ${latest?.result?.summary}`);
}
