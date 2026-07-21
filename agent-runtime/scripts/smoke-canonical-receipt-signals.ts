#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.AGENT_RUNTIME_DATA_DIR = path.join(runtimeRoot, '.runtime-data', 'smoke', `canonical-receipt-signals-${Date.now()}`);

const { canonicalReceiptId, clearCanonicalReceiptsForTesting, getCanonicalReceipt, upsertCanonicalReceipt } = await import('../src/receipts.js');
const { recordCanonicalReceiptCorrection, recordCanonicalReceiptRollback } = await import('../src/governance/receiptTrustSignals.js');
const { clearTrustEventsForTesting, listTrustEvents } = await import('../src/governance/trustStore.js');
const { getTrustScore } = await import('../src/governance/trustService.js');
await clearCanonicalReceiptsForTesting();
await clearTrustEventsForTesting();

const receiptId = canonicalReceiptId('execution', 'correction-rollback-proof');
await upsertCanonicalReceipt({
  id: receiptId,
  subject: { kind: 'execution', id: 'correction-rollback-proof' },
  actor: 'elora',
  requestedBy: 'user',
  action: 'code.patch_file',
  summary: 'Initial patch completed and validated.',
  status: 'completed',
  trustDomain: 'repository',
  policy: { action: 'execute', classification: 'execute_with_receipt', approvalStatus: 'not_required', approvalScope: 'repo.write', authorityBasis: 'reactive_user_request' },
  timestamps: { requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  links: { executionIds: ['correction-rollback-proof'] },
  evidence: {
    resultSummary: 'Initial patch completed.',
    toolsUsed: ['code.patch_file'],
    artifactsChanged: ['src/correction-proof.txt'],
    rollbackGuidance: 'Restore the previous file version from source control.',
  },
  validation: { status: 'passed', required: true, checks: [{ id: 'initial-check', status: 'passed', summary: 'Initial artifact matched the expected content.' }] },
});

const initialEvents = (await listTrustEvents()).length;
assert.ok(initialEvents >= 3);
const correction = await recordCanonicalReceiptCorrection({
  receiptId,
  signalId: 'user-correction-1',
  summary: 'User clarified that the generated wording was incorrect and requires revision.',
});
assert.equal(correction.event.type, 'user_correction');
assert.equal(correction.receipt.trustImpact.eligible, false);
assert.equal(correction.receipt.trustImpact.outcome, 'negative');
assert.equal(correction.receipt.trustImpact.recommendation, 'contract');
assert.ok(correction.receipt.links.trustEventIds.includes(correction.event.id));

const afterCorrectionCount = (await listTrustEvents()).length;
await recordCanonicalReceiptCorrection({
  receiptId,
  signalId: 'user-correction-1',
  summary: 'User clarified that the generated wording was incorrect and requires revision.',
});
assert.equal((await listTrustEvents()).length, afterCorrectionCount, 'repeated correction signal IDs must be idempotent');

const rollback = await recordCanonicalReceiptRollback({
  receiptId,
  signalId: 'rollback-1',
  summary: 'The affected file was restored to the pre-change version.',
});
assert.equal(rollback.event.type, 'rollback_performed');
assert.equal(rollback.event.rollbackPerformed, true);
assert.ok(rollback.receipt.links.trustEventIds.includes(rollback.event.id));
const stored = await getCanonicalReceipt(receiptId);
assert.equal(stored?.trustImpact.recommendation, 'contract');
assert.ok(stored?.evidence.remainingWork.some((entry) => entry.includes('Correction follow-through')));
assert.ok(stored?.evidence.remainingWork.some((entry) => entry.includes('Rollback follow-through')));

const score = await getTrustScore('repository');
assert.equal(score.userCorrections, 1);
assert.equal(score.rollbacks, 1);
assert.ok(score.recommendations.some((recommendation) => recommendation.includes('Contract or hold repository autonomy')));
console.log('✓ Receipt-linked user correction and rollback signals are idempotent, durable, and contract repository trust.');
