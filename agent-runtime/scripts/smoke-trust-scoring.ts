import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `trust-scoring-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = smokeRoot;
await mkdir(smokeRoot, { recursive: true });

const { decidePolicy } = await import('../src/governance/policyDecision.js');
const { clearTrustEventsForTesting } = await import('../src/governance/trustStore.js');
const { getTrustScore, recordTrustEventFromPolicyDecision } = await import('../src/governance/trustService.js');

await clearTrustEventsForTesting();

const ordinary = decidePolicy({ category: 'code', action: 'create_file', riskLevel: 'write', approvalScope: 'repo.write', input: { path: 'src/example.ts' } });
assert.equal(ordinary.action, 'execute');
const beforeOrdinary = await getTrustScore(ordinary.trustDomain);
await recordTrustEventFromPolicyDecision({ decision: ordinary, status: 'completed', actor: 'nexora', action: 'code.create_file', receiptComplete: true, validationPassed: true });
const afterOrdinary = await getTrustScore(ordinary.trustDomain);
assert.equal(afterOrdinary.ordinaryExecutionEvidence, beforeOrdinary.ordinaryExecutionEvidence + 1);
assert.ok(afterOrdinary.score > beforeOrdinary.score, `expected score to increase from ${beforeOrdinary.score}, got ${afterOrdinary.score}`);

const explicitBoundary = decidePolicy({ category: 'gmail', action: 'send_email', riskLevel: 'external_send', approvalScope: 'external.send', input: { to: ['customer@example.com'] } });
assert.equal(explicitBoundary.action, 'ask_before_execution');
const beforeBoundary = await getTrustScore(explicitBoundary.trustDomain);
await recordTrustEventFromPolicyDecision({ decision: explicitBoundary, status: 'blocked', actor: 'elora', action: 'gmail.send_email' });
const afterBoundary = await getTrustScore(explicitBoundary.trustDomain);
assert.equal(afterBoundary.ordinaryExecutionEvidence, beforeBoundary.ordinaryExecutionEvidence, 'explicit-boundary checks must not add ordinary execution evidence');
assert.equal(afterBoundary.explicitBoundaryEvents, beforeBoundary.explicitBoundaryEvents + 1);

console.log('trust scoring smoke checks passed');
