#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `delegated-policy-approvals-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
process.env.NEXORA_WORKSPACE_ROOT = path.join(smokeRoot, 'workspace');
await mkdir(process.env.NEXORA_WORKSPACE_ROOT, { recursive: true });

const { createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
await import('../src/tasks/queue.js');

const task = await createDelegatedTask({
  sessionId: `smoke-delegated-policy-approvals-${Date.now()}`,
  objective: 'Create a Google Drive document containing private data that must stop for explicit approval.',
  requiredTools: ['drive.create_text_file'],
  approvalRequirements: ['External send requires explicit approval.'],
  executionPlan: [
    {
      targetTool: 'drive.create_text_file',
      arguments: { name: 'private-note.txt', content: 'password token private family detail' },
    },
  ],
  initialLog: 'Smoke task for central policy approval boundary.',
});

assert.equal(task.status, 'queued', 'explicit-boundary task should queue so worker can generate pendingToolAction');
assert.equal(task.executionPlan?.[0]?.approvalStatus, 'pending', 'external-send step should require approval');
assert.equal(task.executionPlan?.[0]?.approval?.required, true, 'external-send approval should be created by policy');

const blocked = await waitForTask(task.id, (candidate) => candidate.status === 'blocked');
assert.equal(blocked.blockedReason, 'step_approval_required');
assert.equal(blocked.pendingToolAction?.toolName, 'drive.create_text_file');
assert.equal(blocked.pendingToolAction?.approvalStatus, 'pending');
console.log('delegated policy approval smoke checks passed');

async function waitForTask(taskId: string, predicate: (task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) => boolean) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30000) {
    const task = await getDelegatedTask(taskId);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out waiting for task ${taskId}. Latest status: ${latest?.status}; reason: ${latest?.blockedReason}`);
}
