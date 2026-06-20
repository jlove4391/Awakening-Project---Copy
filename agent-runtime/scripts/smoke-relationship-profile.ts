import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `relationship-profile-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = smokeRoot;
await mkdir(smokeRoot, { recursive: true });

const { getTrustScore } = await import('../src/governance/trustService.js');
const { getRuntimeContext } = await import('../src/memory/index.js');
const {
  clearRelationshipProfilesForTesting,
  getRelationshipContext,
  getRelationshipProfile,
  recordRelationshipEntry,
  recordUserCorrection,
} = await import('../src/relationship/relationshipService.js');

await clearRelationshipProfilesForTesting();

await recordRelationshipEntry({ section: 'preferences', text: 'Jordan prefers execution receipts with concise rollback hints.', tags: ['receipts'], importance: 0.9 });
await recordRelationshipEntry({ section: 'goals', text: 'Build CORE into a relationship-aware execution system.', tags: ['core'], importance: 1 });
await recordRelationshipEntry({ section: 'workingStyle', text: 'Move in small verified implementation steps with smoke coverage.', tags: ['workflow'], importance: 0.8 });
await recordRelationshipEntry({ section: 'recurringContexts', text: 'Repository work should happen inside the configured workspace.', tags: ['workspace'], importance: 0.7 });
await recordRelationshipEntry({ section: 'longTermObjectives', text: 'Earn higher autonomy through reliable execution evidence.', tags: ['autonomy'], importance: 1 });

const beforeCorrectionTrust = await getTrustScore('relationship');
await recordUserCorrection('Do not create approval gates for ordinary local file creation.', { tags: ['approval-boundary'], importance: 1 });
const afterCorrectionTrust = await getTrustScore('relationship');
assert.equal(afterCorrectionTrust.userCorrections, beforeCorrectionTrust.userCorrections + 1);

const profile = await getRelationshipProfile('jordan');
assert.equal(profile.preferences.length, 1);
assert.equal(profile.goals.length, 1);
assert.equal(profile.corrections.length, 1);
assert.equal(profile.workingStyle.length, 1);
assert.equal(profile.recurringContexts.length, 1);
assert.equal(profile.longTermObjectives.length, 1);

const relationshipContext = await getRelationshipContext('jordan');
assert.match(relationshipContext.preferenceSummary, /execution receipts/);
assert.match(relationshipContext.correctionSummary, /approval gates/);
assert.equal(relationshipContext.latestCorrections.length, 1);

const runtimeContext = await getRuntimeContext(`relationship-smoke-${Date.now()}`);
assert.match(runtimeContext.relationshipContext?.goalSummary || '', /relationship-aware execution system/);

console.log('relationship profile smoke checks passed');
