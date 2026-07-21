#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `canonical-receipt-restart-${Date.now()}`);
const dataDir = path.join(smokeRoot, 'data');
const handoffPath = path.join(smokeRoot, 'handoff.json');
process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
await mkdir(smokeRoot, { recursive: true });

const { canonicalReceiptId, clearCanonicalReceiptsForTesting, upsertCanonicalReceipt } = await import('../src/receipts.js');
const { clearTrustEventsForTesting, listTrustEvents } = await import('../src/governance/trustStore.js');
await clearCanonicalReceiptsForTesting();
await clearTrustEventsForTesting();

const receiptId = canonicalReceiptId('execution', 'fresh-process-proof');
const receipt = await upsertCanonicalReceipt({
  id: receiptId,
  subject: { kind: 'execution', id: 'fresh-process-proof' },
  actor: 'elora',
  requestedBy: 'user',
  action: 'code.create_file',
  summary: 'Create a persisted receipt restart proof.',
  status: 'completed',
  trustDomain: 'repository',
  policy: { action: 'execute', classification: 'execute_with_receipt', approvalStatus: 'not_required', approvalScope: 'repo.write', authorityBasis: 'reactive_user_request' },
  timestamps: { requestedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
  links: { sessionId: 'canonical-restart-smoke', executionIds: ['fresh-process-proof'] },
  evidence: {
    resultSummary: 'Persisted restart proof completed.',
    toolsUsed: ['code.create_file'],
    artifactsChanged: ['src/restart-proof.txt'],
    rollbackGuidance: 'Remove the isolated restart proof artifact.',
  },
  validation: {
    status: 'passed',
    required: true,
    checks: [{ id: 'restart-proof-check', status: 'passed', summary: 'Persisted proof verified.' }],
  },
});
assert.equal(receipt.integrity.status, 'complete');
const trustEvents = await listTrustEvents({ domain: 'repository' });
assert.ok(trustEvents.length >= 3);
await writeFile(handoffPath, JSON.stringify({ dataDir, receiptId, trustDomain: 'repository', minimumTrustEvents: trustEvents.length }, null, 2));

const verifierPath = path.join(runtimeRoot, 'scripts', 'verify-canonical-receipt-restart.ts');
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['--import', 'tsx', verifierPath, handoffPath], {
    cwd: runtimeRoot,
    env: { ...process.env, AGENT_RUNTIME_DATA_DIR: dataDir },
    stdio: 'inherit',
  });
  child.on('error', reject);
  child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Fresh-process receipt verifier exited with code ${code}.`)));
});

console.log('Canonical receipt fresh-process restart smoke passed.');
