#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `alpha-evidence-drive-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const workspaceRoot = path.join(smokeRoot, 'workspace');
const sessionId = `alpha-evidence-drive-${Date.now()}`;
const filename = `core-alpha-evidence-${Date.now()}.txt`;
const content = 'Internal CORE Alpha Drive evidence artifact. Do not share externally.';
const contentSourcePath = 'evidence/drive-payload.txt';
const contentReference = `@workspace-file:${contentSourcePath}`;

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.CODE_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
await mkdir(path.join(workspaceRoot, 'evidence'), { recursive: true });
await writeFile(path.join(workspaceRoot, contentSourcePath), content);

const { memoryService } = await import('../src/memory/index.js');
const {
  approvedStep,
  completeAlphaEvidenceCommand,
  startAlphaEvidenceCommand,
  waitForAlphaEvidenceTask,
} = await import('../src/alpha-evidence/index.js');
const { transitionCoreCommand } = await import('../src/core/index.js');
const { decidePolicyForToolName, policyRequiresApproval } = await import('../src/governance/policyDecision.js');
const { getCanonicalReceipt } = await import('../src/receipts.js');
const { createDelegationTask } = await import('../src/tools/delegation.js');
const { getNexoraWorkOrderByTaskId } = await import('../src/tasks/workOrders.js');

// Initialize an empty durable memory database before the context assembler performs
// its parallel retrieval queries. The scenario intentionally has no governing memory.
await memoryService.listMemories({ sessionId, includeGlobal: true, limit: 1 });
assert.equal(
  policyRequiresApproval(decidePolicyForToolName('drive.search_files', { query: filename })),
  false,
  'bounded Drive metadata retrieval must be classified as ordinary read work',
);

const started = await startAlphaEvidenceCommand({
  sessionId,
  requestText: `Create the internal Drive evidence file ${filename}, retrieve it by name, validate the provider result, and do not expose its content.`,
});
const retrievalPreflightApproval = {
  required: true,
  status: 'approved' as const,
  approver: 'alpha_evidence_fixture',
  approvedAt: new Date().toISOString(),
  note: 'Fixture authorization is present only to tolerate legacy task-preflight conservatism; central tool policy still classifies Drive metadata search as an ordinary read.',
};
const task = await createDelegationTask({
  objective: `Create internal Drive file ${filename} and retrieve its metadata by name.`,
  constraints: [
    'Keep the artifact internal and unshared.',
    'Do not send, publish, or expose the file.',
    'Do not include OAuth tokens or private content in logs or receipts.',
  ],
  requiredTools: ['drive.create_text_file', 'drive.search_files'],
  executionPlan: [
    {
      targetTool: 'drive.create_text_file',
      arguments: { name: filename, content: contentReference, mimeType: 'text/plain' },
      approvalStatus: 'approved',
      approval: approvedStep('provider.create', 'alpha_evidence_fixture'),
    },
    {
      targetTool: 'drive.search_files',
      arguments: { query: filename, maxResults: 10 },
      approvalStatus: 'approved',
      approval: retrievalPreflightApproval,
    },
  ],
  authorizationSource: 'user_delegated',
  assignedAgent: 'nexora',
  outputContract: { deliverable: 'Return Drive create-and-retrieve evidence to Elora.', expected_format: 'receipt' },
}, started.context);
let command = (await transitionCoreCommand(started.command.id, 'delegated', {
  summary: `Elora delegated the bounded Drive evidence flow through task ${task.id}.`,
  links: { taskIds: [task.id] },
})).command;

const finalTask = await waitForAlphaEvidenceTask(task.id, (candidate) => {
  const data = candidate.result?.data;
  const primaryReceiptId = data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>).primaryReceiptId : undefined;
  return (candidate.status === 'completed' || candidate.status === 'blocked') && typeof primaryReceiptId === 'string';
}, 45_000);
const workOrder = await getNexoraWorkOrderByTaskId(task.id);
assert.ok(workOrder);
if (!workOrder) throw new Error('Drive evidence work order was not persisted.');
const resultData = finalTask.result?.data as Record<string, unknown>;
const receiptId = String(resultData.primaryReceiptId || '');
const receipt = await getCanonicalReceipt(receiptId);
assert.ok(receipt);
if (!receipt) throw new Error('Drive evidence flow did not publish a canonical receipt.');
assert.equal(receipt.links.commandId, started.command.id);
assert.equal(receipt.links.contextBundleId, started.contextBundle.id);
assert.ok(receipt.links.taskIds.includes(task.id));
assert.ok(receipt.links.workOrderIds.includes(workOrder.id));
assert.ok(!JSON.stringify(receipt).includes(content), 'private Drive content leaked into the canonical receipt');
assert.ok(!JSON.stringify(finalTask.auditTrail).includes(content), 'private Drive content leaked into the task audit trail');
assert.ok(JSON.stringify(finalTask.executionPlan).includes(contentReference), 'durable task plan did not retain the bounded content reference');

if (finalTask.status === 'blocked') {
  assert.equal(finalTask.blockedReason, 'provider_configuration_required');
  assert.equal(workOrder.state, 'blocked');
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.trustImpact.eligible, false);
  command = (await transitionCoreCommand(command.id, 'setup_required', {
    summary: finalTask.result?.summary || 'Google Drive connection is required for the live Alpha evidence flow.',
    links: { taskIds: [task.id], executionIds: receipt.links.executionIds, receiptIds: [receipt.id], trustDomains: [receipt.trustDomain] },
  })).command;
  assert.equal(command.state, 'setup_required');
  console.log(JSON.stringify({
    status: 'setup_required',
    provider: 'google-drive',
    commandId: command.id,
    taskId: task.id,
    workOrderId: workOrder.id,
    primaryReceiptId: receipt.id,
    contentSource: contentReference,
    reason: finalTask.result?.summary,
  }, null, 2));
  process.exit(0);
}

assert.equal(finalTask.status, 'completed');
assert.equal(workOrder.state, 'completed');
assert.equal(receipt.status, 'completed');
assert.equal(receipt.integrity.status, 'complete');
assert.equal(receipt.validation.status, 'passed');
const createStep = workOrder.evidence.stepResults.find((step) => step.tool === 'drive.create_text_file');
const searchStep = workOrder.evidence.stepResults.find((step) => step.tool === 'drive.search_files');
assert.ok(createStep && searchStep, 'Drive create-and-retrieve steps were not both recorded');
const createResult = createStep?.result as { file?: { id?: string; name?: string } } | undefined;
const searchResult = searchStep?.result as { files?: Array<{ id?: string; name?: string }> } | undefined;
const createdId = createResult?.file?.id;
assert.ok(createdId, 'Drive create result did not return a provider file ID');
assert.equal(createResult?.file?.name, filename);
assert.ok(searchResult?.files?.some((file) => file.id === createdId && file.name === filename), 'Drive retrieval did not find the created provider file');
command = await completeAlphaEvidenceCommand(command.id, finalTask, workOrder, receipt);
assert.equal(command.state, 'completed');

console.log(JSON.stringify({
  status: 'passed',
  provider: 'google-drive',
  providerFileId: createdId,
  commandId: command.id,
  taskId: task.id,
  workOrderId: workOrder.id,
  primaryReceiptId: receipt.id,
  contentSource: contentReference,
}, null, 2));
