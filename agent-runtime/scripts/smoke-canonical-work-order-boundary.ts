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
    approvalStatus: 'pending',
    approval: { required: true, status: 'pending', reason: 'explicit repository-delete approval required', scope: 'repo.delete' },
  }],
});

const blocked = await waitForCanonicalTask(task.id, 'blocked');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), 'file must remain before explicit approval');
const blockedReceiptId = (blocked.result?.data as any)?.primaryReceiptId;
assert.ok(blockedReceiptId);
const blockedReceipt = await getCanonicalReceipt(blockedReceiptId);
assert.equal(blockedReceipt?.status, 'blocked');
assert.equal(blockedReceipt?.policy.approvalScope, 'repo.delete');
assert.equal(blockedReceipt?.policy.classification, 'explicit_boundary');
assert.equal(blockedReceipt?.trustImpact.eligible, false);
assert.equal(blockedReceipt?.trustImpact.recommendation, 'hold');

const stepId = blocked.executionPlan?.[0]?.id;
assert.ok(stepId);
const approved = await approveExecutionPlanStep(task.id, stepId!, 'user', 'Approved isolated canonical receipt deletion smoke.');
assert.equal(approved?.status, 'queued');
durableTaskQueue.enqueue(task.id);

const completed = await waitForCanonicalTask(task.id, 'completed');
assert.equal(existsSync(path.join(workspaceRoot, targetPath)), false, 'approved deletion should execute exactly once');
const completedReceiptId = (completed.result?.data as any)?.primaryReceiptId;
assert.equal(completedReceiptId, blockedReceiptId, 'blocked and completed stages must update one primary receipt');
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
assert.equal(events.filter((event) => event.type === 'boundary_accuracy_checked').length, 1, 'receipt stages must not duplicate boundary evidence');
assert.equal(events.filter((event) => event.type === 'action_succeeded').length, 0);
assert.equal(events.filter((event) => event.type === 'validation_succeeded').length, 0);
console.log(`✓ Approved work order ${task.id} retained repo.delete as one non-expanding canonical boundary receipt ${receipt?.id}.`);

async function waitForCanonicalTask(taskId: string, expectedStatus: 'blocked' | 'completed') {
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
