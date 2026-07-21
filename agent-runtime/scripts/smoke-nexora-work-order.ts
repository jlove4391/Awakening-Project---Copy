#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `nexora-work-order-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = 'src/work-order-proof.txt';
const targetContent = 'Nexora work-order execution passed.\n';
const deletePath = 'src/work-order-delete-proof.txt';
const timeoutMs = 30_000;

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';
process.env.NEXORA_ENABLE_DELETE_FILES = 'true';

await mkdir(path.join(workspaceRoot, 'src'), { recursive: true });

const { createDelegatedTask, getDelegatedTask, approveExecutionPlanStep } = await import('../src/tasks/store.js');
const {
  createNexoraWorkOrderForTask,
  getNexoraWorkOrderByTaskId,
  NexoraWorkOrderValidationError,
} = await import('../src/tasks/workOrders.js');

const invalidTask = await createDelegatedTask({
  sessionId: `invalid-work-order-${Date.now()}`,
  objective: 'Perform an unspecified repository change.',
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
});
await assert.rejects(
  () => createNexoraWorkOrderForTask(invalidTask),
  (error: unknown) => error instanceof NexoraWorkOrderValidationError && error.issues.some((issue) => issue.includes('plan step')),
  'underspecified Nexora work orders should fail contract validation before execution',
);
console.log('✓ Invalid Nexora work order failed with a precise contract error.');

const { durableTaskQueue } = await import('../src/tasks/queue.js');

const task = await createDelegatedTask({
  sessionId: `work-order-${Date.now()}`,
  objective: `Create ${targetPath}, verify the resulting artifact, and return receipt-backed proof to Elora.`,
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
  requiredTools: ['code.create_file'],
  constraints: [`Only change ${targetPath}.`, 'Do not commit or push.'],
  executionPlan: [
    {
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
    },
  ],
  memoryContext: [{ id: 'mem_work_order_smoke', type: 'canonical_decision' }],
  outputContract: {
    deliverable: 'Return structured work-order completion proof to Elora.',
    expected_format: 'structured_result',
  },
});

const completed = await waitForTask(task.id, (candidate) => ['completed', 'failed', 'blocked'].includes(candidate.status));
assert.equal(completed.status, 'completed', completed.result?.summary || completed.blockedReason || 'work order did not complete');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), 'work-order artifact should exist');
assert.ok(completed.receipt?.id, 'completed task should have a task receipt');
const completion = (completed.result?.data as any)?.workOrder;
assert.ok(completion?.workOrderId, 'result should include workOrderId');
assert.equal(completion?.terminalStatus, 'completed');
assert.equal(completion?.validation?.passed, true, 'artifact validation should pass');
assert.ok(completion?.artifactsChanged?.includes(targetPath), 'completion should record the changed artifact');
assert.ok(completion?.toolsUsed?.includes('code.create_file'), 'completion should record the executed tool');
assert.ok(completion?.receiptIds?.includes(completed.receipt?.id), 'completion should link the task receipt');
const storedOrder = await getNexoraWorkOrderByTaskId(task.id);
assert.equal(storedOrder?.state, 'completed');
assert.ok(storedOrder?.evidence.validationResults.some((check) => check.status === 'passed'));
console.log(`✓ Work order ${storedOrder?.id} executed, validated, and linked receipt ${completed.receipt?.id}.`);

await writeFile(path.join(workspaceRoot, deletePath), 'Delete only after explicit step approval.\n');
const approvalTask = await createDelegatedTask({
  sessionId: `work-order-approval-${Date.now()}`,
  objective: `Delete ${deletePath} only after explicit approval and validate the governed terminal result.`,
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
  requiredTools: ['code.delete_file'],
  constraints: [`Only delete ${deletePath}.`, 'Do not commit or push.'],
  executionPlan: [
    {
      targetTool: 'code.delete_file',
      arguments: { path: deletePath },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'explicit destructive-step approval required', scope: 'repo.delete' },
    },
  ],
});
assert.ok(existsSync(path.join(workspaceRoot, deletePath)), 'file must remain before approval');
const blockedApprovalTask = await waitForTask(approvalTask.id, (candidate) => ['blocked', 'failed', 'completed'].includes(candidate.status));
assert.equal(blockedApprovalTask.status, 'blocked', blockedApprovalTask.result?.summary || blockedApprovalTask.blockedReason || 'destructive work order should block');
assert.equal(blockedApprovalTask.blockedReason, 'step_approval_required');
assert.ok(existsSync(path.join(workspaceRoot, deletePath)), 'file must remain while the step is blocked');
const stepId = blockedApprovalTask.executionPlan?.[0]?.id;
assert.ok(stepId);
const approved = await approveExecutionPlanStep(approvalTask.id, stepId!, 'user', 'Approved isolated smoke deletion.');
assert.equal(approved?.status, 'queued');
durableTaskQueue.enqueue(approvalTask.id);
const approvalCompleted = await waitForTask(approvalTask.id, (candidate) => ['completed', 'failed', 'blocked'].includes(candidate.status));
assert.equal(approvalCompleted.status, 'completed', approvalCompleted.result?.summary || approvalCompleted.blockedReason || 'approved work order did not complete');
assert.equal(existsSync(path.join(workspaceRoot, deletePath)), false, 'approved file deletion should execute exactly once');
assert.equal((approvalCompleted.result?.data as any)?.workOrder?.terminalStatus, 'completed');
console.log('✓ Approval-gated work-order step blocked, resumed, and completed through the existing step-approval path.');

console.log('Nexora work-order smoke passed.');

async function waitForTask(taskId: string, predicate: (task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) => boolean) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = await getDelegatedTask(taskId);
    if (candidate && predicate(candidate)) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out waiting for task ${taskId}. Latest status=${latest?.status}; result=${latest?.result?.summary}; blocked=${latest?.blockedReason}`);
}
