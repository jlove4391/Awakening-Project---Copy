import assert from 'node:assert/strict';
import { autonomyLevelAllows, autonomyLevelDefinitions } from '../src/governance/autonomyProfiles.js';
import type { RegisteredToolDefinition } from '../src/tools/registry.js';

function tool(name: RegisteredToolDefinition['name'], riskLevel: RegisteredToolDefinition['riskLevel']): RegisteredToolDefinition {
  return {
    name,
    description: name,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    parameters: { parse: (input: unknown) => input },
    scopes: [],
    riskLevel,
    humanApprovalRequired: riskLevel !== 'read',
    audit: { category: name.split('.')[0] as any, action: name, resourceType: 'test', logEvents: [] },
    executor: async () => ({}),
  };
}

const readTool = tool('code.read', 'read');
const writeTool = tool('code.patch_file', 'write');
const recommendTool = tool('observation.recommend', 'write');

assert.deepEqual(Object.keys(autonomyLevelDefinitions), ['0', '1', '2', '3']);

assert.equal(autonomyLevelAllows(0, readTool, {}, 'reactive'), true, 'level 0 allows reactive user-requested reads');
assert.equal(autonomyLevelAllows(0, readTool, {}, 'observation'), false, 'level 0 blocks proactive observation');
assert.equal(autonomyLevelAllows(0, recommendTool, { rank: 1 }, 'reactive'), false, 'level 0 blocks recommendations');
assert.equal(autonomyLevelAllows(0, writeTool, {}, 'reactive'), true, 'level 0 remains reactive and relies on existing approval gates for writes');

assert.equal(autonomyLevelAllows(1, readTool, {}, 'observation'), true, 'level 1 allows read-only observation');
assert.equal(autonomyLevelAllows(1, recommendTool, { rank: 1 }, 'observation'), false, 'level 1 blocks recommendations');
assert.equal(autonomyLevelAllows(1, writeTool, {}, 'observation'), false, 'level 1 blocks writes');

assert.equal(autonomyLevelAllows(2, readTool, {}, 'observation'), true, 'level 2 allows observation reads');
assert.equal(autonomyLevelAllows(2, recommendTool, { rank: 1 }, 'observation'), true, 'level 2 allows ranked recommendations');
assert.equal(autonomyLevelAllows(2, recommendTool, { rank: 1, draftPatchProposal: 'diff --git a/file b/file' }, 'observation'), false, 'level 2 blocks draft patch proposals');
assert.equal(autonomyLevelAllows(2, writeTool, {}, 'observation'), false, 'level 2 blocks writes');

assert.equal(autonomyLevelAllows(3, readTool, {}, 'observation'), true, 'level 3 allows observation reads');
assert.equal(autonomyLevelAllows(3, recommendTool, { rank: 1 }, 'observation'), true, 'level 3 allows ranked recommendations');
assert.equal(autonomyLevelAllows(3, recommendTool, { rank: 1, draftPatchProposal: 'diff --git a/file b/file' }, 'observation'), true, 'level 3 allows draft patch proposals');
assert.equal(autonomyLevelAllows(3, writeTool, {}, 'observation'), false, 'level 3 does not allow automatic patch application');

console.log('Autonomy level policy assertions passed.');
