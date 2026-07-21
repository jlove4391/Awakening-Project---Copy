import assert from 'node:assert/strict';

const required = (name: string) => {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
};

const sessionId = required('CORE_CONTEXT_SMOKE_SESSION_ID');
const query = required('CORE_CONTEXT_SMOKE_QUERY');
const canonicalMemoryId = required('CORE_CONTEXT_SMOKE_MEMORY_ID');
const candidateMemoryId = required('CORE_CONTEXT_SMOKE_CANDIDATE_ID');
const goalId = required('CORE_CONTEXT_SMOKE_GOAL_ID');
const correctionId = required('CORE_CONTEXT_SMOKE_CORRECTION_ID');
const taskId = required('CORE_CONTEXT_SMOKE_TASK_ID');
const priorCommandId = required('CORE_CONTEXT_SMOKE_PRIOR_COMMAND_ID');
const receiptId = required('CORE_CONTEXT_SMOKE_RECEIPT_ID');
const persistedBundleId = required('CORE_CONTEXT_SMOKE_BUNDLE_ID');

const {
  assembleCoreContext,
  createCoreCommand,
  getCoreContextBundle,
} = await import('../src/core/index.js');

const persisted = await getCoreContextBundle(persistedBundleId);
assert.ok(persisted, 'persisted context bundle should survive a fresh process');
assert.equal(persisted.identity.id, 'core');
assert.ok(persisted.references.memoryIds.includes(canonicalMemoryId));
assert.ok(persisted.references.relationshipEntryIds.includes(goalId));
assert.ok(persisted.references.relationshipEntryIds.includes(correctionId));
assert.ok(persisted.references.taskIds.includes(taskId));
assert.ok(persisted.references.commandIds.includes(priorCommandId));
assert.ok(persisted.references.receiptIds.includes(receiptId));

const restartedCommand = await createCoreCommand({
  sessionId,
  agent: 'elora',
  requestText: query,
});
const restarted = await assembleCoreContext({
  sessionId,
  requestText: query,
  agent: 'elora',
  executionMode: 'autonomous',
  requestedAutonomyLevel: 3,
  commandId: restartedCommand.id,
});

assert.equal(restarted.identity.id, 'core');
assert.ok(restarted.references.memoryIds.includes(canonicalMemoryId), 'canonical memory should be retrieved after restart');
assert.ok(!restarted.references.memoryIds.includes(candidateMemoryId), 'unreviewed candidate memory must not become governing turn context');
assert.ok(restarted.references.relationshipEntryIds.includes(goalId), 'goal should survive restart');
assert.ok(restarted.references.relationshipEntryIds.includes(correctionId), 'correction should survive restart');
assert.ok(restarted.references.taskIds.includes(taskId), 'unfinished task should survive restart');
assert.ok(restarted.references.commandIds.includes(priorCommandId), 'unfinished prior command should survive restart');
assert.ok(restarted.references.receiptIds.includes(receiptId), 'prior receipt should survive restart');
assert.equal(restarted.executionEnvelope.primaryTrustDomain, 'repository');
assert.ok(restarted.executionEnvelope.trustScore > 50, 'repository trust evidence should survive restart');
assert.ok(restarted.executionEnvelope.effectiveAutonomyLevel <= restarted.executionEnvelope.requestedAutonomyLevel);
assert.ok(restarted.executionEnvelope.validationRequirement);

console.log(JSON.stringify({
  status: 'CORE context restart verification passed',
  contextBundleId: restarted.id,
  identityId: restarted.identity.id,
  memoryIds: restarted.references.memoryIds,
  relationshipEntryIds: restarted.references.relationshipEntryIds,
  taskIds: restarted.references.taskIds,
  priorCommandIds: restarted.references.commandIds,
  receiptIds: restarted.references.receiptIds,
  executionEnvelope: restarted.executionEnvelope,
}, null, 2));
