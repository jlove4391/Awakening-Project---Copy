#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const handoffPath = process.argv[2];
if (!handoffPath) throw new Error('handoff path is required');
const handoff = JSON.parse(await readFile(handoffPath, 'utf8')) as {
  dataDir: string;
  workspaceRoot: string;
  sessionId: string;
  commandId: string;
  contextBundleId: string;
  doctrineMemoryId: string;
  taskId: string;
  workOrderId: string;
  targetPath: string;
  targetContent: string;
  beforeMtimeMs: number;
};
process.env.AGENT_RUNTIME_DATA_DIR = handoff.dataDir;
process.env.CODE_WORKSPACE_ROOT = handoff.workspaceRoot;
process.env.NEXORA_WORKSPACE_ROOT = handoff.workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';

const { enqueuePersistedQueuedTasks } = await import('../src/tasks/queue.js');
const { getDelegatedTask } = await import('../src/tasks/store.js');
const { getNexoraWorkOrderByTaskId } = await import('../src/tasks/workOrders.js');
const { getCanonicalReceipt } = await import('../src/receipts.js');
const { completeAlphaEvidenceCommand } = await import('../src/alpha-evidence/index.js');
const { getCoreCommand, getCoreContextBundle } = await import('../src/core/index.js');
const { memoryService, AlphaMemoryStatus } = await import('../src/memory/index.js');

const recovered = await enqueuePersistedQueuedTasks();
assert.ok(recovered.some((task) => task.id === handoff.taskId), 'interrupted task was not re-enqueued after restart');

const startedAt = Date.now();
let task = await getDelegatedTask(handoff.taskId);
while (Date.now() - startedAt < 30_000) {
  task = await getDelegatedTask(handoff.taskId);
  const data = task?.result?.data;
  const receiptId = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).primaryReceiptId : undefined;
  if (task?.status === 'completed' && typeof receiptId === 'string') break;
  if (task?.status === 'failed' || task?.status === 'cancelled') throw new Error(task.result?.summary || `Recovered task ended ${task.status}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(task?.status, 'completed');
if (!task) throw new Error('Recovered task was not found.');
assert.equal(task.executionPlan?.[0]?.status, 'completed');
assert.match(task.executionPlan?.[0]?.resultSummary || '', /completed and persisted before/i);
assert.equal(task.executionPlan?.[1]?.status, 'completed');

const target = path.join(handoff.workspaceRoot, handoff.targetPath);
assert.equal(await readFile(target, 'utf8'), handoff.targetContent);
const after = await stat(target);
assert.equal(after.mtimeMs, handoff.beforeMtimeMs, 'completed mutation was replayed after restart');

const workOrder = await getNexoraWorkOrderByTaskId(task.id);
assert.ok(workOrder);
if (!workOrder) throw new Error('Recovered work order was not found.');
assert.equal(workOrder.id, handoff.workOrderId);
assert.equal(workOrder.state, 'completed');
assert.ok(workOrder.evidence.stepResults.some((step) => step.tool === 'code.create_file' && /Previously completed step preserved/i.test(step.summary)));
assert.ok(workOrder.evidence.stepResults.some((step) => step.tool === 'code.read' && step.status === 'completed'));

const resultData = task.result?.data as Record<string, unknown>;
const receiptId = String(resultData.primaryReceiptId || '');
const receipt = await getCanonicalReceipt(receiptId);
assert.ok(receipt);
if (!receipt) throw new Error('Recovered work order did not publish a canonical receipt.');
assert.equal(receipt.integrity.status, 'complete');
assert.equal(receipt.validation.status, 'passed');
assert.equal(receipt.links.commandId, handoff.commandId);
assert.equal(receipt.links.contextBundleId, handoff.contextBundleId);
assert.ok(receipt.links.memoryReferenceIds.includes(handoff.doctrineMemoryId));
assert.ok(receipt.links.taskIds.includes(task.id));
assert.ok(receipt.links.workOrderIds.includes(workOrder.id));

const command = await completeAlphaEvidenceCommand(handoff.commandId, task, workOrder, receipt);
assert.equal(command.state, 'completed');
assert.ok(command.links.receiptIds.includes(receipt.id));
const persistedCommand = await getCoreCommand(handoff.commandId);
assert.equal(persistedCommand?.state, 'completed');
const persistedContext = await getCoreContextBundle(handoff.contextBundleId);
assert.equal(persistedContext?.id, handoff.contextBundleId);
assert.ok(persistedContext?.references.memoryIds.includes(handoff.doctrineMemoryId));
const doctrine = await memoryService.getMemoryById(handoff.doctrineMemoryId);
assert.equal(doctrine?.status, AlphaMemoryStatus.Canonical);

console.log(JSON.stringify({
  status: 'passed',
  commandId: command.id,
  taskId: task.id,
  workOrderId: workOrder.id,
  primaryReceiptId: receipt.id,
  mutationReplayed: false,
}, null, 2));
