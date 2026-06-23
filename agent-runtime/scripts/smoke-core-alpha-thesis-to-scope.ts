import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const prompt = 'Turn the TCHAI thesis memo into the CORE Alpha Scope and create the implementation work order for Nex';
const projectId = 'core-alpha';
const smokeRoot = path.join(tmpdir(), `core-alpha-thesis-to-scope-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
process.env.ALPHA_ARTIFACT_ROOT = path.join(smokeRoot, 'alpha-workspace');
await mkdir(process.env.AGENT_RUNTIME_DATA_DIR, { recursive: true });
await mkdir(process.env.ALPHA_ARTIFACT_ROOT, { recursive: true });

const {
  getRuntimeContext,
  remember,
  retrieveMemories,
  AlphaMemoryConfidence,
  AlphaMemoryStatus,
  AlphaMemoryType,
} = await import('../src/memory/index.js');
const { executeRegisteredTool } = await import('../src/tools/registry.js');
const { validateAlphaReceipt } = await import('../src/alpha/receipts.js');
const { decidePolicy } = await import('../src/governance/policyDecision.js');

const sessionId = `core-alpha-thesis-to-scope-${Date.now()}`;
const context = await getRuntimeContext(sessionId);
context.agent = 'elora';
context.executionMode = 'autonomous';
context.autonomyLevel = 3;

const seedMemories = await Promise.all([
  remember(sessionId, 'TCHAI thesis memo: CORE must turn doctrine into a bounded internal Alpha scope before build work. The scope should preserve reversible execution, auditable receipts, canonical source memory, candidate decision capture, and no audience-facing release without approval.', {
    scope: 'business_context',
    tags: ['tchai', 'core', 'alpha', 'thesis'],
    importance: 1,
    projectId,
    category: 'project_note',
    alphaType: AlphaMemoryType.ProjectNote,
    confidence: AlphaMemoryConfidence.High,
    status: AlphaMemoryStatus.Canonical,
    title: 'TCHAI thesis memo for CORE Alpha',
  }),
  remember(sessionId, 'CORE doctrine memory: internal markdown scope and work-order artifacts are ordinary act/report work when they remain in the Alpha workspace, include complete receipts, cite retrieved memory, and create candidate memories for new decisions.', {
    scope: 'agent_lessons',
    tags: ['tchai', 'core', 'alpha', 'doctrine'],
    importance: 0.98,
    projectId,
    category: 'decision',
    alphaType: AlphaMemoryType.Policy,
    confidence: AlphaMemoryConfidence.High,
    status: AlphaMemoryStatus.Canonical,
    title: 'CORE internal Alpha artifact doctrine',
  }),
]);

assert.ok(seedMemories.every((memory) => memory.metadata?.status === AlphaMemoryStatus.Canonical), 'source TCHAI/CORE doctrine memories should be marked canonical');

const retrieved = await retrieveMemories({
  sessionId,
  query: prompt,
  scopes: ['business_context', 'agent_lessons'],
  tags: ['tchai', 'core', 'alpha'],
  projectId,
  statuses: [AlphaMemoryStatus.Canonical],
  limit: 10,
  includeGlobal: true,
});
assert.ok(retrieved.length >= 2, 'Elora should retrieve canonical TCHAI/CORE doctrine memory');
assert.ok(retrieved.every((memory) => memory.status === AlphaMemoryStatus.Canonical), 'retrieved source memory should remain canonical');
assert.ok(retrieved.some((memory) => /TCHAI thesis memo/i.test(memory.text)), 'retrieved memory should include the TCHAI thesis memo');
assert.ok(retrieved.some((memory) => /internal markdown scope and work-order artifacts/i.test(memory.text)), 'retrieved memory should include CORE artifact doctrine');

const memoryUsed = retrieved.map((memory) => ({
  id: memory.id,
  title: memory.title,
  status: memory.status,
  alphaType: memory.alphaType,
  score: memory.score,
}));

const scopeMemoryCandidates = [
  {
    type: 'decision',
    projectId,
    text: 'CORE Alpha Scope should be represented as an internal markdown artifact before implementation begins.',
    tags: ['core', 'alpha', 'scope', 'decision'],
  },
  {
    type: 'decision',
    projectId,
    text: 'Audience-facing release of the CORE Alpha Scope must escalate for explicit approval rather than execute as act/report work.',
    tags: ['core', 'alpha', 'boundary', 'decision'],
  },
];

const workOrderMemoryCandidates = [
  {
    type: 'work_order',
    projectId,
    text: 'Nexora should implement the CORE Alpha Scope only from an internal work order with acceptance checks, receipt requirements, and boundary constraints.',
    tags: ['core', 'alpha', 'nexora', 'work-order'],
  },
  {
    type: 'decision',
    projectId,
    text: 'Nex implementation must preserve canonical source memory and record newly inferred implementation decisions as candidate memory pending review.',
    tags: ['core', 'alpha', 'memory', 'decision'],
  },
];

const scopePath = `${projectId}/core-alpha-scope.md`;
const workOrderPath = `${projectId}/nexora-implementation-work-order.md`;
const authorityBasis = 'act/report authority: internal Alpha markdown artifacts are reversible workspace writes with complete receipts; audience-facing or client-facing release is outside this authority and must escalate.';

const scopeArtifact = await executeRegisteredTool('alpha.create_artifact', {
  projectId,
  title: 'CORE Alpha Scope',
  type: 'markdown',
  path: scopePath,
  content: [
    '# CORE Alpha Scope',
    '',
    `Source prompt: ${prompt}`,
    '',
    '## Canonical doctrine memory used',
    ...retrieved.map((memory) => `- ${memory.title || memory.id} (${memory.status}): ${memory.text}`),
    '',
    '## Scope boundary',
    '- Create internal Alpha artifacts for the bounded implementation scope.',
    '- Preserve canonical TCHAI/CORE source memory as the source of truth.',
    '- Record new implementation decisions as candidate memory for review.',
    '- Do not externally release this scope without explicit approval.',
    '',
    '## Acceptance checks',
    '1. Alpha Scope markdown artifact exists internally.',
    '2. Nexora implementation work order exists internally.',
    '3. Each artifact has a complete Alpha receipt.',
    '4. Boundary-sensitive release requests escalate instead of acting.',
    '',
  ].join('\n'),
  createdBy: 'elora',
  sourceRequest: prompt,
  memoryUsed,
  memoryCandidates: scopeMemoryCandidates,
  authorityBasis,
}, context) as Record<string, any>;

assert.equal(scopeArtifact.ok, true);
assert.equal(scopeArtifact.status, 'created');
assert.equal(scopeArtifact.path, scopePath);
assert.equal(validateAlphaReceipt(scopeArtifact.receipt).status, 'complete');
assert.deepEqual(scopeArtifact.receipt.memory_used.map((memory: any) => ({ title: memory.title, status: memory.status, alphaType: memory.alphaType })), memoryUsed.map((memory) => ({ title: memory.title, status: memory.status, alphaType: memory.alphaType })));
assert.deepEqual(scopeArtifact.receipt.memory_candidates, scopeMemoryCandidates);
assert.match(scopeArtifact.receipt.authority_basis, /audience-facing.*must escalate/i);

const workOrderArtifact = await executeRegisteredTool('alpha.create_artifact', {
  projectId,
  title: 'Nexora CORE Alpha Implementation Work Order',
  type: 'markdown',
  path: workOrderPath,
  content: [
    '# Nexora CORE Alpha Implementation Work Order',
    '',
    `Source prompt: ${prompt}`,
    '',
    '## Objective for Nex',
    'Implement the CORE Alpha Scope as bounded internal runtime work with auditability, receipt completeness, canonical-source preservation, and candidate-memory capture.',
    '',
    '## Inputs',
    `- Scope artifact: ${scopePath}`,
    ...retrieved.map((memory) => `- Canonical memory: ${memory.title || memory.id} (${memory.id})`),
    '',
    '## Work order constraints',
    '- Internal implementation only until explicit approval is granted for any external release.',
    '- Complete receipts are required for Alpha artifact actions.',
    '- New decisions discovered during implementation must be candidate memories, not canonical memories.',
    '',
  ].join('\n'),
  createdBy: 'elora',
  sourceRequest: prompt,
  memoryUsed,
  memoryCandidates: workOrderMemoryCandidates,
  authorityBasis,
}, context) as Record<string, any>;

assert.equal(workOrderArtifact.ok, true);
assert.equal(workOrderArtifact.status, 'created');
assert.equal(workOrderArtifact.path, workOrderPath);
assert.equal(validateAlphaReceipt(workOrderArtifact.receipt).status, 'complete');
assert.deepEqual(workOrderArtifact.receipt.memory_used.map((memory: any) => ({ title: memory.title, status: memory.status, alphaType: memory.alphaType })), memoryUsed.map((memory) => ({ title: memory.title, status: memory.status, alphaType: memory.alphaType })));
assert.deepEqual(workOrderArtifact.receipt.memory_candidates, workOrderMemoryCandidates);

const scopeContent = await readFile(path.join(process.env.ALPHA_ARTIFACT_ROOT, scopePath), 'utf8');
assert.match(scopeContent, /^# CORE Alpha Scope/m);
assert.match(scopeContent, /Do not externally release this scope without explicit approval/);
const workOrderContent = await readFile(path.join(process.env.ALPHA_ARTIFACT_ROOT, workOrderPath), 'utf8');
assert.match(workOrderContent, /^# Nexora CORE Alpha Implementation Work Order/m);
assert.match(workOrderContent, /Objective for Nex/);

const auditLines = (await readFile(path.join(process.env.AGENT_RUNTIME_DATA_DIR, 'alpha', 'receipts.jsonl'), 'utf8'))
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
assert.equal(auditLines.length, 2, 'Elora should write one receipt for each internal markdown artifact');
assert.ok(auditLines.every((receipt) => validateAlphaReceipt(receipt).status === 'complete'), 'all Alpha receipts should be complete');
assert.ok(auditLines.every((receipt) => receipt.action === 'act/report:create_alpha_artifact'), 'artifact receipts should be act/report create receipts');
assert.ok(auditLines.some((receipt) => receipt.artifact_paths.includes(scopePath)), 'receipt stream should include the scope artifact path');
assert.ok(auditLines.some((receipt) => receipt.artifact_paths.includes(workOrderPath)), 'receipt stream should include the Nexora work order path');

const persistedCandidates = await Promise.all([...scopeMemoryCandidates, ...workOrderMemoryCandidates].map((candidate) => remember(sessionId, candidate.text, {
  scope: candidate.type === 'work_order' ? 'task_history' : 'agent_lessons',
  tags: candidate.tags,
  importance: 0.82,
  projectId,
  category: candidate.type === 'work_order' ? 'work_order' : 'decision',
  alphaType: candidate.type === 'work_order' ? AlphaMemoryType.WorkOrder : AlphaMemoryType.Decision,
  confidence: AlphaMemoryConfidence.Medium,
  status: AlphaMemoryStatus.Candidate,
  metadata: {
    sourceReceiptIds: [scopeArtifact.receipt.receipt_id, workOrderArtifact.receipt.receipt_id],
    sourceArtifactPaths: [scopePath, workOrderPath],
  },
})));
assert.equal(persistedCandidates.length, scopeMemoryCandidates.length + workOrderMemoryCandidates.length);
assert.ok(persistedCandidates.every((memory) => memory.metadata?.status === AlphaMemoryStatus.Candidate), 'new decisions and work orders should be stored as candidate memory');

const publicShareDecision = decidePolicy({
  toolName: 'alpha.create_artifact',
  action: 'publish CORE Alpha Scope publicly',
  category: 'alpha',
  riskLevel: 'write',
  input: { destination: 'public_share', artifactPath: scopePath, request: 'Publish the CORE Alpha Scope externally.' },
});
assert.equal(publicShareDecision.decision, 'escalate');
assert.equal(publicShareDecision.action, 'ask_before_execution');
assert.equal(publicShareDecision.boundary, 'public_representation');
assert.match(publicShareDecision.reason, /Public sharing or publishing requires explicit approval/i);

console.log(JSON.stringify({
  status: 'core alpha thesis-to-scope smoke checks passed',
  sessionId,
  prompt,
  artifactPaths: [scopePath, workOrderPath],
  receiptIds: [scopeArtifact.receipt.receipt_id, workOrderArtifact.receipt.receipt_id],
  canonicalMemoryIds: seedMemories.map((memory) => memory.id),
  candidateMemoryIds: persistedCandidates.map((memory) => memory.id),
  boundaryDecision: publicShareDecision,
}, null, 2));
