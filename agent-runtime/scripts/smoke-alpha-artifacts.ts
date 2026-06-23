import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = await mkdtemp(path.join(tmpdir(), 'alpha-artifacts-'));
process.env.AGENT_RUNTIME_DATA_DIR = path.join(root, 'data');
process.env.ALPHA_ARTIFACT_ROOT = path.join(root, 'artifacts');

const { getRuntimeContext } = await import('../src/memory/index.js');
const { executeRegisteredTool } = await import('../src/tools/registry.js');

const context = await getRuntimeContext(`alpha-artifacts-${Date.now()}`);
context.executionMode = 'delegated';
context.agent = 'alpha';

const created = await executeRegisteredTool('alpha.create_artifact', {
  projectId: 'project-alpha',
  title: 'Alpha Plan',
  type: 'markdown',
  path: 'project-alpha/plan.md',
  content: '# Plan\n',
  createdBy: 'alpha',
  sourceRequest: 'Create an internal plan artifact.',
}, context) as Record<string, any>;
assert.equal(created.ok, true);
assert.equal(created.status, 'created');
assert.notEqual(created.status, 'approval_required');
assert.equal(created.metadata.project_id, 'project-alpha');
assert.equal(created.metadata.receipt_id, created.receipt.receipt_id);
assert.match(created.receipt.action, /act\/report/);

const edited = await executeRegisteredTool('alpha.edit_artifact', {
  projectId: 'project-alpha',
  title: 'Alpha Plan',
  type: 'markdown',
  path: 'project-alpha/plan.md',
  content: '# Revised Plan\n',
  createdBy: 'alpha',
  sourceRequest: 'Revise the internal plan artifact.',
}, context) as Record<string, any>;
assert.equal(edited.ok, true);
assert.equal(edited.status, 'edited');
assert.ok(edited.metadata.before.sha256);
assert.equal(edited.metadata.rollback.before_content, '# Plan\n');
assert.match(edited.receipt.reversal_path, /Overwrite project-alpha\/plan.md/);

const metadata = JSON.parse(await readFile(path.join(process.env.ALPHA_ARTIFACT_ROOT, 'project-alpha/plan.md.alpha.json'), 'utf8'));
assert.equal(metadata.status, 'edited');

for (const badPath of ['/tmp/evil.md', '../evil.md', 'ok/../../evil.md']) {
  await assert.rejects(() => executeRegisteredTool('alpha.create_artifact', {
    projectId: 'project-alpha', title: 'Bad', type: 'markdown', path: badPath, content: '', sourceRequest: 'bad path',
  }, context), /Absolute artifact paths|Parent path traversal/);
}

console.log('alpha artifact smoke checks passed');
