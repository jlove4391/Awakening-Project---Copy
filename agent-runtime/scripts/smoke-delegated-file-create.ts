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

assert.equal(task.status, 'pending_approval', 'task should start pending delegated-task approval');
console.log(`✓ Created delegated task ${task.id}.`);

const approvedTask = await approveDelegatedTask(task.id, 'smoke', 'Approve delegated file-create smoke task.');
assert.equal(approvedTask?.status, 'queued', 'task should queue after delegated-task approval');
console.log('✓ Approved delegated task.');

const blocked = await waitForTask(task.id, (candidate) => candidate.status === 'blocked' && candidate.pendingToolAction?.toolName === 'code.create_file');
assert.equal(blocked.blockedReason, 'step_approval_required');
assert.equal(blocked.pendingToolAction?.approvalStatus, 'pending');
const stepId = blocked.pendingToolAction?.stepId;
assert.ok(stepId, 'blocked task should expose pending file-write step ID');
console.log(`✓ Worker requested file-write approval at step ${stepId}.`);

const stepApproved = await approveExecutionPlanStep(task.id, stepId, 'smoke', 'Approve code.create_file write for smoke.');
assert.equal(stepApproved?.status, 'queued', 'task should requeue after file-write step approval');
console.log('✓ Approved file-write step.');

const finalTask = await waitForTask(task.id, (candidate) => candidate.status === 'completed' || candidate.status === 'failed' || candidate.status === 'blocked');
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
