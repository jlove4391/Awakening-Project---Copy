#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `user-requested-delegated-no-approval-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = '.runtime-smoke/user-requested-no-approval.txt';
const targetContent = 'User-requested delegated task executed without approval prompt.\n';
const sessionId = `smoke-user-requested-delegated-no-approval-${Date.now()}`;
const timeoutMs = Number(process.env.SMOKE_USER_REQUESTED_DELEGATED_NO_APPROVAL_TIMEOUT_MS || 30000);

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';

await mkdir(path.join(workspaceRoot, '.runtime-smoke'), { recursive: true });

const { createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
await import('../src/tasks/queue.js');

const task = await createDelegatedTask({
  sessionId,
  objective: `Create ${targetPath} from an explicit user-requested delegated task.`,
  constraints: [`path: ${targetPath}`, `content: ${targetContent.trim()}`],
  requiredTools: ['code.create_file'],
  authorizationSource: 'user_requested',
  approvalRequirements: ['Would require approval if this were autonomous/proactive.'],
  executionPlan: [
    {
      id: 'create-user-requested-file',
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'write_requires_user_authorization' },
    },
  ],
  initialLog: 'Smoke task verifies user-requested delegated execution bypasses approval prompts while preserving audit receipts.',
});

assert.equal(task.authorizationSource, 'user_requested');
assert.equal(task.status, 'queued');
assert.equal(task.approvalRequirements[0]?.status, 'approved');
assert.equal(task.executionPlan?.[0]?.approvalStatus, 'approved');
assert.ok(task.events.some((event) => event.eventType === 'task.queued'), 'created task should emit queued audit event');

const finalTask = await waitForTask(task.id, (candidate) => ['completed', 'failed', 'blocked'].includes(candidate.status));
assert.equal(finalTask.status, 'completed', `task should complete without an approval block, got ${finalTask.status}: ${finalTask.blockedReason || finalTask.result?.summary}`);
assert.equal(finalTask.blockedReason, undefined);
assert.ok(!finalTask.events.some((event) => event.eventType === 'task.approval_needed'), 'user-requested delegated task should not emit approval-needed prompt');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), `expected ${targetPath} to exist`);
assert.ok(finalTask.receipt?.id, 'completed task should include a receipt');
assert.ok(finalTask.auditTrail.length > 0, 'completed task should retain audit trail entries');
console.log('User-requested delegated no-approval smoke passed.');

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
