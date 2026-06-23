import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const prompt = 'Continue the RealifAI planning work and prepare the next build artifact';
const projectId = 'realifai';
const smokeRoot = path.join(tmpdir(), `core-alpha-realifai-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
process.env.ALPHA_ARTIFACT_ROOT = path.join(smokeRoot, 'alpha-workspace');
await mkdir(process.env.AGENT_RUNTIME_DATA_DIR, { recursive: true });
await mkdir(process.env.ALPHA_ARTIFACT_ROOT, { recursive: true });

const { getRuntimeContext, remember, retrieveMemories, AlphaMemoryStatus, AlphaMemoryType } = await import('../src/memory/index.js');
const { executeRegisteredTool } = await import('../src/tools/registry.js');
const { validateAlphaReceipt } = await import('../src/alpha/receipts.js');

const sessionId = `core-alpha-realifai-${Date.now()}`;
const context = await getRuntimeContext(sessionId);
context.agent = 'elora';
context.executionMode = 'autonomous';
context.autonomyLevel = 3;

const seedMemories = await Promise.all([
  remember(sessionId, 'RealifAI project memory: the next planning artifact should define the build sequence, acceptance checks, and owner decisions before implementation.', {
    scope: 'business_context',
    tags: ['realifai', 'planning', 'alpha'],
    importance: 0.95,
    projectId,
    category: 'project_note',
    alphaType: AlphaMemoryType.Decision,
    status: AlphaMemoryStatus.Active,
    title: 'RealifAI next build planning direction',
  }),
  remember(sessionId, 'RealifAI decision memory: internal Alpha markdown artifacts are allowed for reversible planning work under act/report authority.', {
    scope: 'agent_lessons',
    tags: ['realifai', 'authority', 'alpha'],
    importance: 0.9,
    projectId,
    category: 'decision',
    alphaType: AlphaMemoryType.Policy,
    status: AlphaMemoryStatus.Canonical,
    title: 'RealifAI Alpha artifact authority',
  }),
]);

const retrieved = await retrieveMemories({ sessionId, query: prompt, scopes: ['business_context', 'agent_lessons'], tags: ['realifai'], limit: 5, includeGlobal: true });
assert.ok(retrieved.length >= 2, 'Elora should retrieve seeded RealifAI memories');
assert.ok(retrieved.some((memory) => /RealifAI project memory/i.test(memory.text)), 'retrieved memory should include RealifAI project context');
assert.ok(retrieved.some((memory) => /act\/report authority/i.test(memory.text)), 'retrieved memory should include Alpha authority context');

const artifactPath = `${projectId}/next-build-artifact.md`;
const memoryUsed = retrieved.map((memory) => ({ id: memory.id, title: memory.title, score: memory.score }));
const memoryCandidates = [
  {
    type: 'decision',
    projectId,
    text: 'RealifAI next build artifact should start with a planning-to-build handoff covering build sequence, acceptance checks, risks, and owner decisions.',
    tags: ['realifai', 'decision', 'next-build'],
  },
  {
    type: 'decision',
    projectId,
    text: 'RealifAI planning work may continue through internal Alpha markdown artifacts under reversible act/report authority before external commitments.',
    tags: ['realifai', 'authority', 'alpha'],
  },
];

const artifact = await executeRegisteredTool('alpha.create_artifact', {
  projectId,
  title: 'RealifAI Next Build Artifact',
  type: 'markdown',
  path: artifactPath,
  content: [
    '# RealifAI Next Build Artifact',
    '',
    `Source prompt: ${prompt}`,
    '',
    '## Retrieved memory used',
    ...retrieved.map((memory) => `- ${memory.title || memory.id}: ${memory.text}`),
    '',
    '## Internal artifact action',
    '- Chosen action: create Alpha markdown planning artifact.',
    '- Authority: act/report; reversible internal planning write; no external commitment.',
    '',
    '## Next build sequence',
    '1. Freeze the next RealifAI build scope from current planning memory.',
    '2. Produce acceptance checks for the first executable artifact.',
    '3. Record new decisions as candidate memory before implementation.',
    '',
  ].join('\n'),
  createdBy: 'elora',
  sourceRequest: prompt,
  memoryUsed,
  memoryCandidates,
  authorityBasis: 'act/report authority decision: reversible internal Alpha planning artifact under the configured workspace; no external sharing, RMT, or destructive action.',
}, context) as Record<string, any>;

assert.equal(artifact.ok, true);
assert.equal(artifact.status, 'created');
assert.equal(artifact.path, artifactPath);
assert.match(artifact.receipt.action, /^act\/report:create_alpha_artifact$/);
assert.match(artifact.receipt.authority_basis, /act\/report authority decision/i);
assert.deepEqual(artifact.receipt.memory_used.map((memory: any) => memory.title), memoryUsed.map((memory) => memory.title));
assert.deepEqual(artifact.receipt.memory_candidates, memoryCandidates);
assert.equal(validateAlphaReceipt(artifact.receipt).status, 'complete');

const artifactContent = await readFile(path.join(process.env.ALPHA_ARTIFACT_ROOT, artifactPath), 'utf8');
assert.match(artifactContent, /RealifAI Next Build Artifact/);
assert.match(artifactContent, /Chosen action: create Alpha markdown planning artifact/);

const auditJsonl = await readFile(path.join(process.env.AGENT_RUNTIME_DATA_DIR, 'alpha', 'receipts.jsonl'), 'utf8');
assert.ok(auditJsonl.split('\n').filter(Boolean).some((line) => JSON.parse(line).action === 'act/report:create_alpha_artifact'), 'Alpha receipt should be appended to the Alpha audit stream');

const persistedCandidates = await Promise.all(memoryCandidates.map((candidate) => remember(sessionId, candidate.text, {
  scope: 'agent_lessons',
  tags: candidate.tags,
  importance: 0.8,
  projectId,
  category: 'decision',
  alphaType: AlphaMemoryType.Decision,
  status: AlphaMemoryStatus.Candidate,
  metadata: { sourceReceiptId: artifact.receipt.receipt_id, sourceArtifactPath: artifactPath },
})));
assert.equal(persistedCandidates.length, memoryCandidates.length);
assert.ok(persistedCandidates.every((candidate) => candidate.metadata?.status === AlphaMemoryStatus.Candidate), 'new decisions should be stored as candidate memory');

console.log(JSON.stringify({
  status: 'core alpha RealifAI smoke checks passed',
  sessionId,
  prompt,
  artifactPath,
  receiptId: artifact.receipt.receipt_id,
  retrievedMemoryIds: retrieved.map((memory) => memory.id),
  candidateMemoryIds: persistedCandidates.map((memory) => memory.id),
}, null, 2));
