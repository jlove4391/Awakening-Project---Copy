#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `alpha-evidence-local-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const workspaceRoot = path.join(smokeRoot, 'workspace');
const sessionId = `alpha-evidence-local-${Date.now()}`;
const artifactPath = 'evidence/doctrine-proof.md';
const artifactContent = 'CORE-DOCTRINE: preserve explicit boundaries and return validated receipt evidence.\n';
const sensitivePath = 'evidence/private-boundary.txt';

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.CODE_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';
process.env.NEXORA_ENABLE_DELETE_FILES = 'true';
await mkdir(path.join(workspaceRoot, 'evidence'), { recursive: true });
await writeFile(path.join(workspaceRoot, sensitivePath), 'This file must remain until explicit delete approval.\n');

const {
  AlphaMemoryConfidence,
  AlphaMemoryStatus,
  createMemoryCandidateFromEvidence,
  memoryService,
  reviewMemoryCandidate,
} = await import('../src/memory/index.js');
const {
  assertArtifactContent,
  completeAlphaEvidenceCommand,
  runBlockedAlphaEvidenceTask,
  startAlphaEvidenceCommand,
  waitForAlphaEvidenceTask,
} = await import('../src/alpha-evidence/index.js');
const { assembleCoreContext, getCoreCommand, transitionCoreCommand } = await import('../src/core/index.js');
const { getCanonicalReceipt } = await import('../src/receipts.js');
const { listTrustEvents } = await import('../src/governance/trustStore.js');
const { createDelegationTask } = await import('../src/tools/delegation.js');
const { getNexoraWorkOrderByTaskId } = await import('../src/tasks/workOrders.js');

const doctrine = await memoryService.createMemory({
  sessionId,
  category: 'decision',
  title: 'Alpha evidence artifact doctrine',
  text: 'For this Alpha evidence workspace, generated proof artifacts must begin with CORE-DOCTRINE and preserve explicit approval boundaries.',
  summary: 'Evidence artifacts begin with CORE-DOCTRINE and preserve explicit boundaries.',
  scope: 'business_context',
  status: AlphaMemoryStatus.Canonical,
  confidence: AlphaMemoryConfidence.High,
  reviewNeeded: false,
  retrievalPriority: 1,
  importance: 1,
  tags: ['alpha-evidence', 'doctrine', 'repository'],
  actor: { actorId: 'jordan', actorType: 'user', displayName: 'Jordan' },
});

const started = await startAlphaEvidenceCommand({
  sessionId,
  requestText: 'Using the remembered Alpha evidence artifact doctrine, create a bounded repository proof file and validate it.',
});
assert.ok(started.contextBundle.references.memoryIds.includes(doctrine.id), 'canonical doctrine was not assembled before execution');
assert.ok(started.contextBundle.memories.some((memory) => memory.id === doctrine.id && memory.status === AlphaMemoryStatus.Canonical));

const task = await createDelegationTask({
  objective: `Create ${artifactPath} according to the remembered doctrine and validate the resulting artifact.`,
  constraints: ['Use the governing memory in the assembled context.', `Only change ${artifactPath}.`, 'Do not commit, push, send, or publish.'],
  requiredTools: ['code.create_file'],
  executionPlan: [{
    targetTool: 'code.create_file',
    arguments: { path: artifactPath, content: artifactContent },
  }],
  authorizationSource: 'user_delegated',
  assignedAgent: 'nexora',
  memoryContext: [{ id: doctrine.id, status: doctrine.status, category: doctrine.category }],
  outputContract: { deliverable: 'Return validated artifact proof to Elora.', expected_format: 'receipt' },
}, started.context);
await transitionCoreCommand(started.command.id, 'delegated', {
  summary: `Elora delegated doctrine-backed evidence task ${task.id} to Nexora.`,
  links: { taskIds: [task.id] },
});

const completedTask = await waitForAlphaEvidenceTask(task.id, (candidate) => {
  const data = candidate.result?.data;
  return candidate.status === 'completed' && Boolean(data && typeof data === 'object' && !Array.isArray(data) && (data as Record<string, unknown>).primaryReceiptId);
});
await assertArtifactContent(workspaceRoot, artifactPath, artifactContent);
const workOrder = await getNexoraWorkOrderByTaskId(task.id);
assert.ok(workOrder, 'completed task did not persist a Nexora work order');
if (!workOrder) throw new Error('completed task did not persist a Nexora work order');
const completedData = completedTask.result?.data as Record<string, unknown>;
const receiptId = String(completedData.primaryReceiptId || '');
const receipt = await getCanonicalReceipt(receiptId);
assert.ok(receipt, 'completed work order did not publish a canonical receipt');
if (!receipt) throw new Error('completed work order did not publish a canonical receipt');
assert.equal(receipt.integrity.status, 'complete');
assert.equal(receipt.validation.status, 'passed');
assert.equal(receipt.links.commandId, started.command.id);
assert.equal(receipt.links.contextBundleId, started.contextBundle.id);
assert.ok(receipt.links.memoryReferenceIds.includes(doctrine.id));
assert.ok(receipt.links.taskIds.includes(task.id));
assert.ok(receipt.links.workOrderIds.includes(workOrder.id));
assert.ok(receipt.evidence.artifactsChanged.includes(artifactPath));

const candidate = await createMemoryCandidateFromEvidence({
  sessionId,
  category: 'decision',
  title: 'Validated Alpha evidence convention',
  text: 'Future Alpha evidence artifacts in this isolated project should preserve the CORE-DOCTRINE header convention demonstrated by the validated work order.',
  summary: 'Use the validated CORE-DOCTRINE header convention for related Alpha evidence artifacts.',
  scope: 'business_context',
  confidence: AlphaMemoryConfidence.High,
  importance: 0.9,
  tags: ['alpha-evidence', 'candidate', 'doctrine'],
  actor: { actorId: 'elora', actorType: 'agent', displayName: 'Elora' },
  evidence: {
    commandId: started.command.id,
    contextBundleId: started.contextBundle.id,
    receiptId: receipt.id,
    taskIds: [task.id],
    workOrderIds: [workOrder.id],
    executionIds: receipt.links.executionIds,
  },
});
assert.equal(candidate.status, AlphaMemoryStatus.Candidate);
assert.equal(candidate.reviewNeeded, true);

const beforePromotion = await assembleCoreContext({
  sessionId,
  requestText: 'Recall the validated Alpha evidence convention for future CORE-DOCTRINE artifacts.',
  agent: 'elora',
  executionMode: 'reactive',
});
assert.ok(!beforePromotion.references.memoryIds.includes(candidate.id), 'unreviewed candidate memory became governing context');

const command = await completeAlphaEvidenceCommand(started.command.id, completedTask, workOrder, receipt, [candidate.id]);
assert.equal(command.state, 'completed');
assert.ok(command.links.memoryCandidateIds.includes(candidate.id));
assert.ok(command.links.receiptIds.includes(receipt.id));
const sourceReceipt = await getCanonicalReceipt(receipt.id);
assert.ok(sourceReceipt?.links.memoryCandidateIds.includes(candidate.id), 'source receipt did not link the produced memory candidate');

const reviewed = await reviewMemoryCandidate({
  candidateId: candidate.id,
  decision: 'promote',
  reviewer: 'jordan',
  note: 'Approved as a narrow, evidence-backed convention for this Alpha project.',
  confirmedByUser: true,
});
assert.equal(reviewed.candidate.status, AlphaMemoryStatus.Canonical);
assert.equal(reviewed.candidate.reviewNeeded, false);
assert.equal(reviewed.review.canonicalMemoryId, candidate.id);
assert.ok(reviewed.receipt.links.memoryCandidateIds.includes(candidate.id));
assert.ok(reviewed.receipt.links.memoryReferenceIds.includes(candidate.id));
assert.ok(reviewed.receipt.links.supportingReceiptIds.includes(receipt.id));

const afterPromotion = await assembleCoreContext({
  sessionId,
  requestText: 'Recall the validated Alpha evidence convention for future CORE-DOCTRINE artifacts.',
  agent: 'elora',
  executionMode: 'reactive',
});
assert.ok(afterPromotion.references.memoryIds.includes(candidate.id), 'promoted canonical memory did not become governing context');
assert.ok(afterPromotion.memories.some((memory) => memory.id === candidate.id && memory.status === AlphaMemoryStatus.Canonical));

const sensitive = await runBlockedAlphaEvidenceTask({
  sessionId: `${sessionId}-boundary`,
  requestText: `Delete ${sensitivePath} without asking again.`,
  objective: `Delete ${sensitivePath}.`,
  constraints: [`Only target ${sensitivePath}.`, 'Do not bypass repository-delete approval.'],
  requiredTools: ['code.delete_file'],
  executionPlan: [{ targetTool: 'code.delete_file', arguments: { path: sensitivePath } }],
});
assert.equal(sensitive.command.state, 'approval_pending');
assert.equal(sensitive.task.status, 'pending_approval');
assert.equal(sensitive.task.blockedReason, undefined);
assert.equal(sensitive.task.executionPlan?.[0]?.approvalStatus, 'pending');
assert.ok(existsSync(path.join(workspaceRoot, sensitivePath)), 'sensitive deletion executed before explicit approval');
assert.equal(sensitive.receipt.status, 'pending_approval');
assert.equal(sensitive.receipt.policy.classification, 'explicit_boundary');
assert.equal(sensitive.receipt.policy.approvalScope, 'repo.delete');
assert.equal(sensitive.receipt.trustImpact.eligible, false);
const boundaryEvents = (await listTrustEvents()).filter((event) => event.receiptId === sensitive.receipt.id);
assert.equal(boundaryEvents.filter((event) => event.type === 'action_succeeded').length, 0);
assert.equal(boundaryEvents.filter((event) => event.type === 'boundary_accuracy_checked').length, 1);
const persistedSensitiveCommand = await getCoreCommand(sensitive.command.id);
assert.equal(persistedSensitiveCommand?.state, 'approval_pending');

console.log(JSON.stringify({
  status: 'passed',
  doctrineMemoryId: doctrine.id,
  commandId: command.id,
  taskId: task.id,
  workOrderId: workOrder.id,
  primaryReceiptId: receipt.id,
  candidateId: candidate.id,
  memoryReviewReceiptId: reviewed.receipt.id,
  sensitiveCommandId: sensitive.command.id,
  sensitiveReceiptId: sensitive.receipt.id,
}, null, 2));
