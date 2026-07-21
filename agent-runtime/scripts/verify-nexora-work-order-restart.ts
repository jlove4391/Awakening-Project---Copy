#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const taskId = String(process.env.RESTART_WORK_ORDER_TASK_ID || '');
const targetPath = String(process.env.RESTART_WORK_ORDER_PATH || '');
const expectedContent = String(process.env.RESTART_WORK_ORDER_CONTENT || '');
const workspaceRoot = String(process.env.NEXORA_WORKSPACE_ROOT || '');
assert.ok(taskId, 'RESTART_WORK_ORDER_TASK_ID is required');
assert.ok(targetPath, 'RESTART_WORK_ORDER_PATH is required');
assert.ok(workspaceRoot, 'NEXORA_WORKSPACE_ROOT is required');

const { getDelegatedTask } = await import('../src/tasks/store.js');
const { getNexoraWorkOrderByTaskId } = await import('../src/tasks/workOrders.js');
const { enqueuePersistedQueuedTasks } = await import('../src/tasks/queue.js');

const recovered = await enqueuePersistedQueuedTasks();
assert.ok(recovered.some((task) => task.id === taskId), 'interrupted running task should be recovered into the durable queue');

const terminal = await waitForTask(taskId);
assert.equal(terminal.status, 'completed', terminal.result?.summary || terminal.blockedReason || 'recovered task did not complete');
assert.equal(terminal.executionPlan?.[0]?.status, 'completed');
assert.equal(terminal.executionPlan?.[0]?.resultSummary, 'File creation completed before the simulated restart.');
assert.equal(terminal.executionPlan?.[1]?.status, 'completed');
assert.equal(await readFile(path.join(workspaceRoot, targetPath), 'utf8'), expectedContent, 'completed file creation must not be repeated or altered');
const workOrder = await getNexoraWorkOrderByTaskId(taskId);
assert.equal(workOrder?.state, 'completed');
assert.ok(workOrder?.stateHistory.some((event) => event.summary.includes('Recovered an interrupted Nexora work order')));
assert.ok((terminal.result?.data as any)?.workOrder?.validation?.passed, 'recovered work order should complete validation');
assert.ok(terminal.receipt?.id, 'recovered work order should produce a task receipt');
console.log(`✓ Recovered task ${taskId} in a fresh process without repeating its completed mutation.`);

async function waitForTask(id: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const task = await getDelegatedTask(id);
    if (task && ['completed', 'failed', 'blocked', 'cancelled'].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(id);
  throw new Error(`Timed out waiting for recovered task ${id}; latest status=${latest?.status}; result=${latest?.result?.summary}; blocked=${latest?.blockedReason}`);
}
