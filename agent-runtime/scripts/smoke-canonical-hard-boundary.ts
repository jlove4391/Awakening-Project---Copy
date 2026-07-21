#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.AGENT_RUNTIME_DATA_DIR = path.join(runtimeRoot, '.runtime-data', 'smoke', `canonical-hard-boundary-${Date.now()}`);

const { canonicalReceiptId, clearCanonicalReceiptsForTesting, upsertCanonicalReceipt } = await import('../src/receipts.js');
const { clearTrustEventsForTesting, listTrustEvents } = await import('../src/governance/trustStore.js');
await clearCanonicalReceiptsForTesting();
await clearTrustEventsForTesting();

const receiptId = canonicalReceiptId('execution', 'approved-delete-completion');
await upsertCanonicalReceipt({
  id: receiptId,
  subject: { kind: 'execution', id: 'approved-delete-completion' },
  actor: 'nexora',
  requestedBy: 'user',
  action: 'code.delete_file',
  summary: 'Approved deletion completed with validation.',
  status: 'completed',
  trustDomain: 'repository',
  policy: {
    action: 'execute',
    classification: 'execute_with_receipt',
    approvalStatus: 'approved',
    approvalScope: 'repo.delete',
    authorityBasis: 'explicit_user_approval',
  },
  timestamps: { requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  links: { executionIds: ['approved-delete-completion'] },
  evidence: {
    resultSummary: 'Approved deletion completed.',
    toolsUsed: ['code.delete_file'],
    artifactsChanged: ['src/delete-proof.txt'],
    rollbackGuidance: 'Restore the file from version control if reversal is required.',
  },
  validation: {
    status: 'passed',
    required: true,
    checks: [{ id: 'delete-absence-check', status: 'passed', summary: 'The approved target is absent.' }],
  },
});

const events = (await listTrustEvents()).filter((event) => event.receiptId === receiptId);
assert.equal(events.filter((event) => event.type === 'action_succeeded').length, 0, 'completed repo.delete must not count as ordinary execution trust');
assert.equal(events.filter((event) => event.type === 'validation_succeeded').length, 0, 'hard-boundary completion must not expand validation trust');
assert.equal(events.filter((event) => event.type === 'boundary_accuracy_checked').length, 1);
assert.equal(events[0]?.policyClassification, 'explicit_boundary');
assert.equal(events[0]?.policyAction, 'ask_before_execution');
console.log('✓ A completed, approved repo.delete receipt remains explicit-boundary evidence and cannot expand autonomy.');
