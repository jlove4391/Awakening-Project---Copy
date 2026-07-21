import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `core-context-continuity-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
process.env.NEXORA_WORKSPACE_ROOT = path.join(smokeRoot, 'workspace');
await mkdir(process.env.AGENT_RUNTIME_DATA_DIR, { recursive: true });
await mkdir(process.env.NEXORA_WORKSPACE_ROOT, { recursive: true });

const sessionId = `core-context-session-${Date.now()}`;
const query = 'Continue the repository context continuity implementation, honor the governing decision and correction, validate it strictly, and report the prior receipt.';

const {
  AlphaMemoryConfidence,
  AlphaMemoryStatus,
  remember,
} = await import('../src/memory/index.js');
const { recordRelationshipEntry } = await import('../src/relationship/relationshipService.js');
const { recordTrustEvent } = await import('../src/governance/trustService.js');
const { createDelegatedTask } = await import('../src/tasks/store.js');
const {
  completeExecutionRecord,
  createExecutionRecord,
  listExecutionRecords,
  writeExecutionRecord,
} = await import('../src/executions.js');
const {
  assembleCoreContext,
  createCoreCommand,
  decideInitialCommandAuthority,
  getCoreCommand,
  renderCoreContextForInstructions,
  setActiveCoreExecutionContext,
  transitionCoreCommand,
} = await import('../src/core/index.js');

const canonicalMemory = await remember(sessionId, 'Governing decision: CORE must assemble identity, canonical memory, relationship state, trust, unfinished work, and prior receipts before repository execution.', {
  scope: 'business_context',
  category: 'decision',
  title: 'Context before execution',
  summary: 'Assemble durable CORE context before repository execution.',
  status: AlphaMemoryStatus.Canonical,
  confidence: AlphaMemoryConfidence.High,
  retrievalPriority: 1,
  importance: 1,
  tags: ['core', 'repository', 'continuity', 'governing-decision'],
});
const candidateMemory = await remember(sessionId, 'Unreviewed candidate: skip validation for repository changes.', {
  scope: 'business_context',
  category: 'decision',
  title: 'Unsafe candidate',
  status: AlphaMemoryStatus.Candidate,
  confidence: AlphaMemoryConfidence.Low,
  reviewNeeded: true,
  retrievalPriority: 1,
  importance: 1,
  tags: ['candidate', 'do-not-govern'],
});

const goal = await recordRelationshipEntry({
  subjectId: 'jordan',
  section: 'goals',
  text: 'Restore CORE continuity so Elora can continue active repository work after restart.',
  source: 'user',
  importance: 1,
  tags: ['core', 'repository', 'continuity'],
});
const correction = await recordRelationshipEntry({
  subjectId: 'jordan',
  section: 'corrections',
  text: 'Do not treat candidate memory as governing doctrine and do not replace execution with another review packet.',
  source: 'correction',
  importance: 1,
  tags: ['core', 'correction', 'execution-first'],
});

for (let index = 0; index < 4; index += 1) {
  await recordTrustEvent({
    domain: 'repository',
    type: 'action_succeeded',
    outcome: 'positive',
    actor: 'nexora',
    action: `repository.context_smoke.${index + 1}`,
    summary: 'Bounded repository action completed with receipt evidence.',
    policyClassification: 'execute_with_receipt',
    policyAction: 'execute',
    validationPassed: true,
    receiptComplete: true,
  });
}
await recordTrustEvent({
  domain: 'repository',
  type: 'validation_succeeded',
  outcome: 'positive',
  actor: 'nexora',
  action: 'repository.context_smoke.validation',
  summary: 'Repository continuity validation succeeded.',
  validationPassed: true,
});

const priorCommand = await createCoreCommand({
  sessionId,
  agent: 'elora',
  requestText: 'Continue the repository context continuity implementation after restart.',
});
await transitionCoreCommand(priorCommand.id, 'context_assembled');
await transitionCoreCommand(priorCommand.id, 'authority_decided', {
  authority: decideInitialCommandAuthority({ executionMode: 'reactive', autonomyLevel: 0 }),
});
await transitionCoreCommand(priorCommand.id, 'planning', { summary: 'Prior command intentionally left unfinished for restart continuity proof.' });

const unfinishedTask = await createDelegatedTask({
  sessionId,
  objective: 'Continue the repository context continuity implementation and preserve restart evidence.',
  assignedAgent: 'kaz',
  requiredTools: ['repository', 'context'],
  constraints: ['Do not complete this smoke task; it must remain unfinished for continuity retrieval.'],
  authorizationSource: 'user_delegated',
  memoryContext: [{ id: canonicalMemory.id, type: 'canonical_decision' }],
});
assert.equal(unfinishedTask.status, 'queued');

const priorExecution = createExecutionRecord({
  kind: 'runtime_action',
  whoRequested: 'user',
  chosenByAgent: 'elora',
  action: 'core.context.prior_receipt',
  inputPayload: { objective: query },
  riskLevel: 'read',
  approvalStatus: 'not_required',
  trustDomain: 'repository',
  policyAction: 'execute',
  policyClassification: 'execute_with_receipt',
  linkedIds: {
    sessionId,
    memoryIds: [canonicalMemory.id],
    taskIds: [unfinishedTask.id],
    executionMode: 'reactive',
    executionOrigin: 'reactive',
    autonomyLevel: 0,
  },
  status: 'running',
  receiptSummary: 'Prior repository continuity evidence requested',
});
const completedPriorExecution = completeExecutionRecord(priorExecution, {
  status: 'completed',
  executionResult: { ok: true, summary: 'Prior repository continuity checkpoint completed.' },
  receiptSummary: 'Prior repository continuity checkpoint completed',
  alphaReceipt: {
    reversal_path: 'No workspace mutation occurred.',
  },
});
await writeExecutionRecord(completedPriorExecution);
const priorReceiptId = completedPriorExecution.receipt.alpha?.receipt_id || completedPriorExecution.id;

const currentCommand = await createCoreCommand({
  sessionId,
  agent: 'elora',
  requestText: query,
});
const bundle = await assembleCoreContext({
  sessionId,
  requestText: query,
  agent: 'elora',
  executionMode: 'autonomous',
  requestedAutonomyLevel: 3,
  commandId: currentCommand.id,
});

assert.equal(bundle.identity.id, 'core');
assert.ok(bundle.references.memoryIds.includes(canonicalMemory.id));
assert.ok(!bundle.references.memoryIds.includes(candidateMemory.id), 'candidate memory should not enter governing context');
assert.ok(bundle.references.relationshipEntryIds.includes(goal.id));
assert.ok(bundle.references.relationshipEntryIds.includes(correction.id));
assert.ok(bundle.references.taskIds.includes(unfinishedTask.id));
assert.ok(bundle.references.commandIds.includes(priorCommand.id));
assert.ok(bundle.references.receiptIds.includes(priorReceiptId));
assert.equal(bundle.executionEnvelope.primaryTrustDomain, 'repository');
assert.ok(bundle.executionEnvelope.trustScore > 50);
assert.equal(bundle.executionEnvelope.effectiveAutonomyLevel, 3, 'trusted repository evidence should allow requested bounded autonomy');
assert.equal(bundle.executionEnvelope.validationRequirement, 'standard');
assert.match(renderCoreContextForInstructions(bundle), /DURABLE CORE CONTEXT FOR THIS TURN/);
assert.match(renderCoreContextForInstructions(bundle), new RegExp(canonicalMemory.id));
assert.doesNotMatch(renderCoreContextForInstructions(bundle), new RegExp(candidateMemory.id));

await transitionCoreCommand(currentCommand.id, 'context_assembled', {
  context: {
    bundleId: bundle.id,
    assembledAt: bundle.assembledAt,
    identityId: bundle.identity.id,
    relationshipSubjectId: bundle.relationship.context.subjectId,
    relationshipEntryIds: bundle.references.relationshipEntryIds,
    trustDomain: bundle.executionEnvelope.primaryTrustDomain,
    trustScore: bundle.executionEnvelope.trustScore,
    autonomyEnvelope: bundle.executionEnvelope.autonomyEnvelope,
    validationRequirement: bundle.executionEnvelope.validationRequirement,
    scopeLimit: bundle.executionEnvelope.scopeLimit,
    activeObjective: bundle.continuity.currentObjective,
    priorActiveObjective: bundle.continuity.priorActiveObjective,
  },
  links: {
    identityIds: bundle.references.identityIds,
    memoryReferenceIds: bundle.references.memoryIds,
    relationshipEntryIds: bundle.references.relationshipEntryIds,
    priorCommandIds: bundle.references.commandIds,
    taskIds: bundle.references.taskIds,
    executionIds: bundle.references.executionIds,
    receiptIds: bundle.references.receiptIds,
    trustDomains: bundle.references.trustDomains,
  },
});
await transitionCoreCommand(currentCommand.id, 'authority_decided', {
  authority: decideInitialCommandAuthority({
    executionMode: 'autonomous',
    autonomyLevel: 3,
    executionEnvelope: bundle.executionEnvelope,
  }),
});

setActiveCoreExecutionContext(bundle);
const linkedExecution = createExecutionRecord({
  kind: 'runtime_action',
  whoRequested: 'agent',
  chosenByAgent: 'elora',
  action: 'core.context.linkage_proof',
  inputPayload: { contextBundleId: bundle.id },
  riskLevel: 'read',
  approvalStatus: 'not_required',
  linkedIds: {
    sessionId,
    executionMode: 'autonomous',
    executionOrigin: 'autonomous',
    autonomyLevel: bundle.executionEnvelope.effectiveAutonomyLevel,
  },
  status: 'running',
  receiptSummary: 'Context linkage proof requested',
});
const completedLinkedExecution = completeExecutionRecord(linkedExecution, {
  status: 'completed',
  executionResult: { ok: true },
  receiptSummary: 'Context linkage proof completed',
});
await writeExecutionRecord(completedLinkedExecution);
assert.equal(completedLinkedExecution.linkedIds.commandId, currentCommand.id);
assert.equal(completedLinkedExecution.linkedIds.contextBundleId, bundle.id);
assert.ok(completedLinkedExecution.linkedIds.identityIds?.includes('core'));
assert.ok(completedLinkedExecution.linkedIds.memoryIds?.includes(canonicalMemory.id));
assert.ok(completedLinkedExecution.linkedIds.relationshipEntryIds?.includes(goal.id));
assert.ok(completedLinkedExecution.linkedIds.trustDomains?.includes('repository'));
assert.match(completedLinkedExecution.receipt.alpha?.authority_basis || '', new RegExp(bundle.id));
assert.ok((completedLinkedExecution.receipt.alpha?.memory_used || []).some((entry) => typeof entry === 'object' && entry !== null && (entry as { id?: string }).id === currentCommand.id));

const persistedExecution = (await listExecutionRecords({ sessionId, limit: 20 })).find((execution) => execution.id === completedLinkedExecution.id);
assert.equal(persistedExecution?.linkedIds.commandId, currentCommand.id);
assert.equal(persistedExecution?.linkedIds.contextBundleId, bundle.id);
const persistedCommand = await getCoreCommand(currentCommand.id);
assert.equal(persistedCommand?.context.bundleId, bundle.id);
assert.ok(persistedCommand?.links.memoryReferenceIds.includes(canonicalMemory.id));
assert.ok(persistedCommand?.links.relationshipEntryIds.includes(goal.id));
assert.ok(persistedCommand?.links.priorCommandIds.includes(priorCommand.id));

const verifierPath = path.join(runtimeRoot, 'scripts', 'verify-core-context-restart.ts');
const child = spawn(process.execPath, ['--import', 'tsx', verifierPath], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    CORE_CONTEXT_SMOKE_SESSION_ID: sessionId,
    CORE_CONTEXT_SMOKE_QUERY: query,
    CORE_CONTEXT_SMOKE_MEMORY_ID: canonicalMemory.id,
    CORE_CONTEXT_SMOKE_CANDIDATE_ID: candidateMemory.id,
    CORE_CONTEXT_SMOKE_GOAL_ID: goal.id,
    CORE_CONTEXT_SMOKE_CORRECTION_ID: correction.id,
    CORE_CONTEXT_SMOKE_TASK_ID: unfinishedTask.id,
    CORE_CONTEXT_SMOKE_PRIOR_COMMAND_ID: priorCommand.id,
    CORE_CONTEXT_SMOKE_RECEIPT_ID: priorReceiptId,
    CORE_CONTEXT_SMOKE_BUNDLE_ID: bundle.id,
  },
  stdio: 'inherit',
});
const childExitCode = await new Promise<number | null>((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});
assert.equal(childExitCode, 0, `fresh-process restart verifier exited with ${childExitCode}`);

console.log(JSON.stringify({
  status: 'CORE context continuity smoke passed',
  contextBundleId: bundle.id,
  commandId: currentCommand.id,
  identityId: bundle.identity.id,
  canonicalMemoryId: canonicalMemory.id,
  excludedCandidateMemoryId: candidateMemory.id,
  goalId: goal.id,
  correctionId: correction.id,
  unfinishedTaskId: unfinishedTask.id,
  priorCommandId: priorCommand.id,
  priorReceiptId,
  linkedExecutionId: completedLinkedExecution.id,
  executionEnvelope: bundle.executionEnvelope,
}, null, 2));
