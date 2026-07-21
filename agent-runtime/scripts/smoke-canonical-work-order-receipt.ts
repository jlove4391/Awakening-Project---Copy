#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `canonical-work-order-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = 'src/canonical-work-order-proof.txt';
process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';
await mkdir(path.join(workspaceRoot, 'src'), { recursive: true });

const { clearCanonicalReceiptsForTesting, getCanonicalReceipt, listCanonicalReceipts } = await import('../src/receipts.js');
const { clearTrustEventsForTesting, listTrustEvents } = await import('../src/governance/trustStore.js');
const { createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
const { getNexoraWorkOrderByTaskId } = await import('../src/tasks/workOrders.js');
await import('../src/tasks/queue.js');
await clearCanonicalReceiptsForTesting();
await clearTrustEventsForTesting();

const task = await createDelegatedTask({
  sessionId: `canonical-work-order-${Date.now()}`,
  objective: `Create ${targetPath}, verify the artifact, and return one primary canonical receipt to Elora.`,
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
  requiredTools: ['code.create_file'],
  constraints: [`Only change ${targetPath}.`, 'Do not commit or push.'],
  executionPlan: [{
    targetTool: 'code.create_file',
    arguments: { path: targetPath, content: 'Canonical work-order receipt passed.\n' },
  }],
});

const completed = await waitForCanonicalTask(task.id);
assert.equal(completed.status, 'completed', completed.result?.summary || completed.blockedReason || 'work order did not complete');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)));
const data = completed.result?.data as any;
assert.ok(data?.primaryReceiptId, 'completed task result should expose the primary canonical receipt ID');
assert.ok(data?.receiptIds?.includes(data.primaryReceiptId));
assert.equal(data?.completion?.receiptId, data.primaryReceiptId);
assert.equal(data?.workOrder?.receiptId, data.primaryReceiptId);

const receipt = await getCanonicalReceipt(data.primaryReceiptId);
assert.ok(receipt);
assert.equal(receipt!.subject.kind, 'work_order');
assert.equal(receipt!.status, 'completed');
assert.equal(receipt!.integrity.status, 'complete');
assert.equal(receipt!.validation.status, 'passed');
assert.ok(receipt!.links.taskIds.includes(task.id));
assert.ok(receipt!.links.workOrderIds.includes(receipt!.subject.id));
assert.ok(receipt!.links.executionIds.length >= 1, 'primary work-order receipt should link supporting execution records');
assert.ok(receipt!.evidence.artifactsChanged.includes(targetPath));
assert.ok(receipt!.evidence.toolsUsed.includes('code.create_file'));
assert.ok(receipt!.evidence.rollbackGuidance.length > 0);

const order = await getNexoraWorkOrderByTaskId(task.id);
assert.ok(order?.evidence.receiptIds.includes(receipt!.id), 'work-order evidence should reference the primary canonical receipt');
const sessionReceipts = await listCanonicalReceipts({ sessionId: task.sessionId, limit: 20 });
assert.equal(sessionReceipts.filter((candidate) => candidate.primary && candidate.subject.kind === 'work_order').length, 1);
const primaryEvents = (await listTrustEvents()).filter((event) => event.receiptId === receipt!.id);
assert.equal(primaryEvents.filter((event) => event.type === 'receipt_quality_checked').length, 1);
assert.equal(primaryEvents.filter((event) => event.type === 'validation_succeeded').length, 1);
assert.equal(primaryEvents.filter((event) => event.type === 'action_succeeded').length, 1);
const supportingExecutionIds = receipt!.links.executionIds;
const supportingReceipts = sessionReceipts.filter((candidate) => candidate.subject.kind === 'execution' && supportingExecutionIds.includes(candidate.subject.id));
assert.ok(supportingReceipts.length >= 1);
for (const supporting of supportingReceipts) {
  assert.equal(supporting.trustImpact.eligible, false);
  assert.equal((await listTrustEvents()).filter((event) => event.receiptId === supporting.id && event.type === 'action_succeeded').length, 0);
}
console.log(`✓ Nexora work order ${order?.id} published exactly one primary receipt ${receipt!.id} with supporting execution proof and one trust outcome.`);
console.log('Canonical work-order receipt smoke passed.');

async function waitForCanonicalTask(taskId: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const candidate = await getDelegatedTask(taskId);
    const candidateData = candidate?.result?.data as any;
    if (candidate && ['failed', 'blocked'].includes(candidate.status)) return candidate;
    if (candidate?.status === 'completed' && candidateData?.primaryReceiptId) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out waiting for canonical work-order receipt. status=${latest?.status}; summary=${latest?.result?.summary}`);
}
