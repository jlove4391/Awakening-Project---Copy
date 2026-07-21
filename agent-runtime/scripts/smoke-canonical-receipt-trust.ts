#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `canonical-receipt-trust-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const handoffPath = path.join(smokeRoot, 'handoff.json');
process.env.AGENT_RUNTIME_DATA_DIR = dataDir;

await mkdir(smokeRoot, { recursive: true });

const {
  canonicalReceiptId,
  clearCanonicalReceiptsForTesting,
  getCanonicalReceipt,
  upsertCanonicalReceipt,
  validateCanonicalReceipt,
} = await import('../src/receipts.js');
const { clearTrustEventsForTesting, listTrustEvents } = await import('../src/governance/trustStore.js');
const { getTrustScore } = await import('../src/governance/trustService.js');
const { completeExecutionRecord, createExecutionRecord, writeExecutionRecord } = await import('../src/executions.js');

await clearCanonicalReceiptsForTesting();
await clearTrustEventsForTesting();

const incomplete = validateCanonicalReceipt({
  id: 'incomplete',
  version: '1.0',
  primary: true,
  subject: { kind: 'execution', id: 'missing-links' },
} as any);
assert.equal(incomplete.status, 'incomplete');
assert.ok(incomplete.missingFields.includes('actor'));
assert.ok(incomplete.invalidLinks.some((issue) => issue.includes('execution ID')));
console.log('✓ Canonical receipt completeness and link diagnostics reject incomplete proof.');

const execution = createExecutionRecord({
  kind: 'tool_call',
  whoRequested: 'user',
  chosenByAgent: 'elora',
  action: 'code.create_file',
  inputPayload: { path: 'src/proof.txt' },
  riskLevel: 'write',
  approvalStatus: 'not_required',
  approvalScope: 'repo.write',
  linkedIds: { sessionId: 'canonical-receipt-smoke', executionMode: 'reactive', executionOrigin: 'reactive' },
  status: 'running',
  startedAt: new Date().toISOString(),
  receiptSummary: 'Create bounded proof file.',
});
const completedExecution = completeExecutionRecord(execution, {
  status: 'completed',
  executionResult: { ok: true, status: 'created', path: 'src/proof.txt' },
  providerResponseSummary: 'Created src/proof.txt.',
  receiptSummary: 'Created bounded proof file.',
});
await writeExecutionRecord(completedExecution);
const executionReceipt = await getCanonicalReceipt(completedExecution.receipt.primaryReceiptId);
assert.equal(executionReceipt?.subject.kind, 'execution');
assert.equal(executionReceipt?.subject.id, completedExecution.id);
assert.equal(executionReceipt?.integrity.status, 'complete');
assert.equal(executionReceipt?.validation.status, 'passed');
assert.ok(executionReceipt?.links.executionIds.includes(completedExecution.id));
assert.ok(executionReceipt?.evidence.artifactsChanged.includes('src/proof.txt'));
console.log(`✓ Execution ${completedExecution.id} published primary receipt ${executionReceipt?.id}.`);

for (let index = 1; index <= 2; index += 1) {
  await upsertCanonicalReceipt({
    id: canonicalReceiptId('execution', `trusted-execution-${index}`),
    subject: { kind: 'execution', id: `trusted-execution-${index}` },
    actor: 'elora',
    requestedBy: 'user',
    action: 'code.create_file',
    summary: `Validated repository action ${index}.`,
    status: 'completed',
    trustDomain: 'repository',
    policy: { action: 'execute', classification: 'execute_with_receipt', approvalStatus: 'not_required', approvalScope: 'repo.write', authorityBasis: 'reactive_user_request' },
    timestamps: { requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
    links: { executionIds: [`trusted-execution-${index}`] },
    evidence: {
      resultSummary: `Validated repository action ${index} completed.`,
      toolsUsed: ['code.create_file'],
      artifactsChanged: [`src/trusted-${index}.txt`],
      rollbackGuidance: 'Remove the isolated smoke artifact.',
    },
    validation: {
      status: 'passed',
      required: true,
      checks: [{ id: `check-${index}`, status: 'passed', summary: 'Artifact exists.' }],
    },
  });
}

const repositoryTrust = await getTrustScore('repository');
assert.ok(repositoryTrust.successfulActions >= 3, 'three complete validated execution receipts should produce successful action evidence');
assert.ok(repositoryTrust.validationSuccesses >= 3);
assert.ok(repositoryTrust.receiptQualityChecks >= 3);
assert.ok(repositoryTrust.recommendations.some((recommendation) => recommendation.includes('expanding repository autonomy')));
console.log('✓ Repeated complete and validated receipts produce bounded autonomy-expansion evidence.');

const boundaryReceiptId = canonicalReceiptId('execution', 'delete-boundary');
await upsertCanonicalReceipt({
  id: boundaryReceiptId,
  subject: { kind: 'execution', id: 'delete-boundary' },
  actor: 'nexora',
  requestedBy: 'user',
  action: 'code.delete_file',
  summary: 'Repository deletion is waiting for explicit approval.',
  status: 'blocked',
  trustDomain: 'repository',
  policy: { action: 'ask_before_execution', classification: 'explicit_boundary', boundary: 'destructive_irreversible', approvalStatus: 'pending', approvalScope: 'repo.delete', authorityBasis: 'explicit_step_approval_required' },
  timestamps: { requestedAt: new Date().toISOString() },
  links: { taskIds: ['delete-task'], executionIds: ['delete-boundary'] },
  evidence: {
    resultSummary: 'Deletion did not execute.',
    remainingWork: ['Wait for explicit approval.'],
    rollbackGuidance: 'No rollback is required because no deletion occurred.',
  },
  validation: { status: 'pending', required: true, checks: [] },
});
const boundaryEvents = (await listTrustEvents()).filter((event) => event.receiptId === boundaryReceiptId);
assert.equal(boundaryEvents.filter((event) => event.type === 'action_succeeded').length, 0);
assert.equal(boundaryEvents.filter((event) => event.type === 'boundary_accuracy_checked').length, 1);
console.log('✓ Explicit approval boundaries create neutral boundary evidence and never successful execution trust.');

const failedReceiptId = canonicalReceiptId('execution', 'failed-validation');
await upsertCanonicalReceipt({
  id: failedReceiptId,
  subject: { kind: 'execution', id: 'failed-validation' },
  actor: 'nexora',
  requestedBy: 'user',
  action: 'code.patch_file',
  summary: 'Patch execution failed required validation.',
  status: 'failed',
  trustDomain: 'repository',
  policy: { action: 'execute', classification: 'execute_with_receipt', approvalStatus: 'not_required', approvalScope: 'repo.write', authorityBasis: 'reactive_user_request' },
  timestamps: { requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  links: { executionIds: ['failed-validation'] },
  evidence: {
    resultSummary: 'Required artifact verification failed.',
    errors: ['Expected output was not present.'],
    remainingWork: ['Correct the patch and re-run validation.'],
    rollbackGuidance: 'Restore the pre-change file from version control.',
  },
  validation: {
    status: 'failed',
    required: true,
    checks: [{ id: 'failed-check', status: 'failed', summary: 'Artifact verification failed.' }],
  },
});
const trustAfterFailure = await getTrustScore('repository');
assert.ok(trustAfterFailure.validationFailures >= 1);
assert.ok(trustAfterFailure.failedActions >= 1);
assert.ok(trustAfterFailure.recommendations.some((recommendation) => recommendation.includes('Contract or hold repository autonomy')));
console.log('✓ Failed validation contracts or holds the repository trust recommendation.');

const eventCountBeforeRepeat = (await listTrustEvents()).length;
const failedReceipt = await getCanonicalReceipt(failedReceiptId);
assert.ok(failedReceipt);
await upsertCanonicalReceipt({
  id: failedReceipt!.id,
  subject: failedReceipt!.subject,
  actor: failedReceipt!.actor,
  requestedBy: failedReceipt!.requestedBy,
  action: failedReceipt!.action,
  summary: failedReceipt!.summary,
  status: failedReceipt!.status,
  trustDomain: failedReceipt!.trustDomain,
  policy: failedReceipt!.policy,
  timestamps: failedReceipt!.timestamps,
  links: failedReceipt!.links,
  evidence: failedReceipt!.evidence,
  validation: failedReceipt!.validation,
});
assert.equal((await listTrustEvents()).length, eventCountBeforeRepeat, 're-upserting the same receipt must not duplicate trust evidence');
console.log('✓ Canonical receipt-derived trust events are idempotent.');

await writeFile(handoffPath, JSON.stringify({ dataDir, expectedReceiptId: executionReceipt!.id, minimumTrustEvents: eventCountBeforeRepeat }, null, 2));
console.log(`CANONICAL_RECEIPT_HANDOFF=${handoffPath}`);
console.log('Canonical receipt and trust-loop smoke passed.');
