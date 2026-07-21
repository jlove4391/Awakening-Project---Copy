#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const handoffPath = process.argv[2];
if (!handoffPath) throw new Error('handoff path is required');
const handoff = JSON.parse(await readFile(path.resolve(handoffPath), 'utf8')) as {
  dataDir: string;
  receiptId: string;
  trustDomain: string;
  minimumTrustEvents: number;
};
process.env.AGENT_RUNTIME_DATA_DIR = handoff.dataDir;

const { getCanonicalReceipt } = await import('../src/receipts.js');
const { listTrustEvents } = await import('../src/governance/trustStore.js');
const { getTrustScore } = await import('../src/governance/trustService.js');

const receipt = await getCanonicalReceipt(handoff.receiptId);
assert.ok(receipt, 'canonical receipt should survive a fresh process');
assert.equal(receipt.integrity.status, 'complete');
assert.equal(receipt.validation.status, 'passed');
assert.ok(receipt.links.trustEventIds.length >= 3, 'persisted receipt should retain linked trust-event IDs');
const events = await listTrustEvents({ domain: handoff.trustDomain });
assert.ok(events.length >= handoff.minimumTrustEvents, 'trust events should survive a fresh process');
assert.ok(events.every((event) => event.receiptId), 'receipt-derived trust events should retain their primary receipt link');
const score = await getTrustScore(handoff.trustDomain);
assert.ok(score.receiptQualityChecks >= 1);
assert.ok(score.validationSuccesses >= 1);
assert.ok(score.successfulActions >= 1);
console.log(`✓ Fresh process restored canonical receipt ${receipt.id} and ${events.length} receipt-derived trust event(s).`);
