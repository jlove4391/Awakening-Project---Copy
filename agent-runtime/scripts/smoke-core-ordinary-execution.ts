import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `core-ordinary-${Date.now()}`);
process.env.AGENT_RUNTIME_DATA_DIR = path.join(smokeRoot, 'data');
process.env.CODE_WORKSPACE_ROOT = path.join(smokeRoot, 'workspace');
process.env.NEXORA_WORKSPACE_ROOT = process.env.CODE_WORKSPACE_ROOT;
await mkdir(process.env.AGENT_RUNTIME_DATA_DIR, { recursive: true });
await mkdir(process.env.CODE_WORKSPACE_ROOT, { recursive: true });

const { getRuntimeContext } = await import('../src/memory/index.js');
const { getTrustScore } = await import('../src/governance/trustService.js');
const { executeRegisteredTool } = await import('../src/tools/registry.js');

const context = await getRuntimeContext(`core-ordinary-${Date.now()}`);
context.executionMode = 'delegated';
context.agent = 'nexora';

const mkdirResult = await executeRegisteredTool('code.mkdir', { path: 'src' }, context) as Record<string, unknown>;
assert.equal(mkdirResult.ok, true);
assert.notEqual(mkdirResult.status, 'approval_required');

const createResult = await executeRegisteredTool('code.create_file', { path: 'src/example.txt', content: 'alpha\n' }, context) as Record<string, unknown>;
assert.equal(createResult.ok, true);
assert.notEqual(createResult.status, 'approval_required');

const editResult = await executeRegisteredTool('code.edit', { path: 'src/example.txt', content: 'beta\n' }, context) as Record<string, unknown>;
assert.equal(editResult.ok, true);
assert.notEqual(editResult.status, 'approval_required');

const patchResult = await executeRegisteredTool('code.patch_file', { path: 'src/example.txt', search: 'beta', replace: 'gamma' }, context) as Record<string, unknown>;
assert.equal(patchResult.ok, true);
assert.notEqual(patchResult.status, 'approval_required');

const commandResult = await executeRegisteredTool('code.run_command', { command: 'node -e "console.log(42)"', cwd: '.', timeoutMs: 10000, maxOutputBytes: 20000 }, context) as Record<string, unknown>;
assert.equal(commandResult.ok, true);
assert.notEqual(commandResult.status, 'approval_required');

const testResult = await executeRegisteredTool('code.test', { command: 'node -e "console.log(\'test ok\')"', cwd: '.', timeoutMs: 10000, maxOutputBytes: 20000 }, context) as Record<string, unknown>;
assert.equal(testResult.ok, true);
assert.notEqual(testResult.status, 'approval_required');

const deleteResult = await executeRegisteredTool('code.delete_file', { path: 'src/example.txt' }, context) as Record<string, unknown>;
assert.equal(deleteResult.ok, true);
assert.equal(deleteResult.status, 'trashed');
assert.ok(deleteResult.trashPath);

const repositoryTrust = await getTrustScore('repository');
const commandTrust = await getTrustScore('commands');
assert.ok(repositoryTrust.successfulActions >= 4, `expected repository trust events, got ${repositoryTrust.successfulActions}`);
assert.ok(commandTrust.successfulActions >= 2, `expected command trust events, got ${commandTrust.successfulActions}`);

console.log('core ordinary execution smoke checks passed');
