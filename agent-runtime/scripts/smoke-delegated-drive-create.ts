#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { approveDelegatedTask, approveExecutionPlanStep, createDelegatedTask, getDelegatedTask } from '../src/tasks/store.js';
import '../src/tasks/queue.js';

const timeoutMs = Number(process.env.SMOKE_DELEGATED_DRIVE_CREATE_TIMEOUT_MS || 30000);
const sessionId = `smoke-delegated-drive-create-${Date.now()}`;
const filename = `nexora-delegated-smoke-${Date.now()}.txt`;
const content = 'Nexora delegated Google Drive create smoke.';

console.log('Delegated Drive create smoke: creating delegated task.');

const task = await createDelegatedTask({
  sessionId,
  objective: 'Create a text file in Google Drive.',
  constraints: [`filename: ${filename}`, `content: ${content}`],
  requiredTools: ['drive.create_text_file'],
  approvalRequirements: ['Approve this delegated task before Nexora may prepare the Drive write step.'],
  initialLog: 'Smoke task for delegated Google Drive text-file creation.',
});

assert.equal(task.status, 'pending_approval', 'task should start pending task approval');
console.log(`✓ Created delegated task ${task.id}.`);

const approvedTask = await approveDelegatedTask(task.id, 'smoke', 'Approve delegated Drive create smoke task.');
assert.equal(approvedTask?.status, 'queued', 'task should queue after task approval');
console.log('✓ Approved delegated task.');

const blocked = await waitForTask(task.id, (candidate) => candidate.status === 'blocked' && candidate.pendingToolAction?.toolName === 'drive.create_text_file');
assert.equal(blocked.blockedReason, 'step_approval_required');
assert.equal(blocked.pendingToolAction?.approvalStatus, 'pending');
const stepId = blocked.pendingToolAction?.stepId;
assert.ok(stepId, 'blocked task should expose pending Drive step ID');
console.log(`✓ Worker blocked for Drive write approval at step ${stepId}.`);

const stepApproved = await approveExecutionPlanStep(task.id, stepId, 'smoke', 'Approve Drive create_text_file write for smoke.');
assert.equal(stepApproved?.status, 'queued', 'task should requeue after Drive step approval');
console.log('✓ Approved Drive write step.');

const finalTask = await waitForTask(task.id, (candidate) => candidate.status === 'completed' || candidate.status === 'blocked' || candidate.status === 'failed');

if (finalTask.status === 'completed') {
  assert.equal(finalTask.result?.ok, true);
  assert.ok(JSON.stringify(finalTask.result).includes('drive.create_text_file'), 'completed result should include Drive tool response');
  assert.ok(finalTask.receipt, 'completed task should include receipt');
  assert.ok(JSON.stringify(finalTask.receipt).includes('drive.create_text_file'), 'receipt should include Drive response proof');
  console.log('✓ Worker completed and recorded Drive response in result and receipt.');
} else if (finalTask.status === 'blocked') {
  const blockData = finalTask.result?.data as { status?: string; providerName?: string; missingConfigHint?: string; nextManualAction?: string } | undefined;
  assert.equal(finalTask.blockedReason, 'provider_configuration_required');
  assert.equal(blockData?.status, 'provider_configuration_required');
  assert.equal(blockData?.providerName, 'Google Drive');
  assert.ok(blockData?.missingConfigHint, 'blocked provider result should include a missing env/config hint');
  assert.ok(blockData?.nextManualAction, 'blocked provider result should include the next manual action');
  assert.match(finalTask.result?.summary || '', /Google Drive provider configuration required/i);
  console.log(`✓ Worker returned clear provider configuration block: ${finalTask.result?.summary}`);
} else {
  assert.fail(`Task failed instead of completing or blocking clearly: ${finalTask.result?.summary || 'no summary'}`);
}

console.log(`Delegated Drive create smoke passed with final status: ${finalTask.status}.`);

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
