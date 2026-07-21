#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `canonical-work-order-boundary-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = 'src/canonical-delete-boundary.txt';
process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_DELETE_FILES = 'true';
await mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
await writeFile(path.join(workspaceRoot, targetPath), 'Delete only after explicit approval.\n');

const { clearCanonicalReceiptsForTesting, getCanonicalReceipt } = await import('../src/receipts.js');
const { clearTrustEventsForTesting, listTrustEvents } = await import('../src/governance/trustStore.js');
const { approveExecutionPlanStep, createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
const { durableTaskQueue } = await import('../src/tasks/queue.js');
await clearCanonicalReceiptsForTesting();
await clearTrustEventsForTesting();

const task = await createDelegatedTask({
  sessionId: `canonical-delete-boundary-${Date.now()}`,
  objective: `Delete ${targetPath} only after explicit approval, validate absence, and preserve the approval boundary in the primary receipt.`,
  assignedAgent: 'nexora',
  authorizationSource: 'user_delegated',
  requiredTools: ['code.delete_file'],
  constraints: [`Only delete ${targetPath}.`, 'Do not commit or push.'],
  executionPlan: [{
    targetTool: 'code.delete_file',
    arguments: { path: targetPath },
  }],
});
assert.equal(task.status, 'pending_approval', 'the normalized hard-boundary step must not enter execution before approval');

const pending = await waitForCanonicalTask(task.id, 'pending_approval');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), 'file must remain before explicit approval');
const pendingReceiptId = (pending.result?.data as any)?.primaryReceiptId;
assert.ok(pendingReceiptId);
const pendingReceipt = await getCanonicalReceipt(pendingReceiptId);
assert.equal(pendingReceipt?.status, 'pending_approval');
assert.equal(pendingReceipt?.policy.approvalScope, 'repo.delete');
assert.equal(pendingReceipt?.policy.classification, 'explicit_boundary');
assert.equal(pendingReceipt?.trustImpact.eligible, false);
assert.equal(pendingReceipt?.trustImpact.recommendation, 'hold');

const stepId = pending.executionPlan?.[0]?.id;
assert.ok(stepId);
assert.equal(pending.executionPlan?.[0]?.approvalStatus, 'pending');
const approved = await approveExecutionPlanStep(task.id, stepId!, 'user', 'Approved isolated canonical receipt deletion smoke.');
assert.equal(approved?.status, 'queued');
durableTaskQueue.enqueue(task.id);

const completed = await waitForCanonicalTask(task.id, 'completed');
assert.equal(existsSync(path.join(workspaceRoot, targetPath)), false, 'approved deletion should execute exactly once');
const completedReceiptId = (completed.result?.data as any)?.primaryReceiptId;
assert.equal(completedReceiptId, pendingReceiptId, 'pending approval and completed stages must update one primary receipt');
const receipt = await getCanonicalReceipt(completedReceiptId);
assert.equal(receipt?.status, 'completed');
assert.equal(receipt?.integrity.status, 'complete');
assert.equal(receipt?.validation.status, 'passed');
assert.equal(receipt?.policy.approvalScope, 'repo.delete');
assert.equal(receipt?.policy.approvalStatus, 'approved');
assert.equal(receipt?.policy.classification, 'explicit_boundary');
assert.equal(receipt?.trustImpact.eligible, false);
assert.equal(receipt?.trustImpact.outcome, 'neutral');
assert.equal(receipt?.trustImpact.recommendation, 'hold');
const events = (await listTrustEvents()).filter((event) => event.receiptId === receipt?.id);
assert.equal(events.filter((event) => event.type === 'boundary_accuracy_checked').length, 1, 'receipt lifecycle stages must not duplicate boundary evidence');
assert.equal(events.filter((event) => event.type === 'action_succeeded').length, 0);
assert.equal(events.filter((event) => event.type === 'validation_succeeded').length, 0);
console.log(`✓ Approved work order ${task.id} retained repo.delete as one non-expanding canonical boundary receipt ${receipt?.id}.`);

async function waitForCanonicalTask(taskId: string, expectedStatus: 'pending_approval' | 'completed') {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    const candidate = await getDelegatedTask(taskId);
    const data = candidate?.result?.data as any;
    if (candidate?.status === 'failed') throw new Error(candidate.result?.summary || 'work order failed');
    if (candidate?.status === expectedStatus && data?.primaryReceiptId) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out waiting for ${expectedStatus} canonical boundary receipt. status=${latest?.status}; summary=${latest?.result?.summary}`);
}
