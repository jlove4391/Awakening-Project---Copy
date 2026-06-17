import assert from 'node:assert/strict';
import { getRegisteredTool } from '../src/tools/registry.js';
import { devAutonomyProfile, requiresApprovalForAutonomyProfile } from '../src/governance/autonomyProfiles.js';

function tool(name: string) {
  const definition = getRegisteredTool(name);
  assert(definition, `expected registered tool ${name}`);
  return definition;
}

function approvalRequired(name: string, input: Record<string, unknown> = {}) {
  return requiresApprovalForAutonomyProfile('dev_autonomy', tool(name), input);
}

assert.equal(devAutonomyProfile.name, 'dev_autonomy');
assert.deepEqual(devAutonomyProfile.allowedWithoutAdditionalApproval.webTools.sort(), ['web.crawl_site', 'web.fetch_url']);

assert.equal(approvalRequired('web.fetch_url', { url: 'https://example.com' }), false);
assert.equal(approvalRequired('web.crawl_site', { url: 'https://example.com' }), false);
assert.equal(approvalRequired('code.read', { path: 'agent-runtime/src/config.ts' }), false);
assert.equal(approvalRequired('code.create_file', { path: '.runtime-data/dev-autonomy/notes.md', content: 'draft' }), false);
assert.equal(approvalRequired('code.create_file', { path: 'sandbox/dev-autonomy/draft.txt', content: 'draft' }), false);

assert.equal(approvalRequired('code.create_file', { path: 'agent-runtime/src/new.ts', content: 'source edit' }), true);
assert.equal(approvalRequired('code.create_file', { path: 'package.json', content: '{}' }), true);
assert.equal(approvalRequired('code.edit', { path: '.runtime-data/dev-autonomy/notes.md', content: 'edit' }), true);
assert.equal(approvalRequired('code.run_command', { command: 'npm test', cwd: '.' }), true);
assert.equal(approvalRequired('code.test', { command: 'npm test' }), true);
assert.equal(approvalRequired('code.commit', { message: 'commit' }), true);
assert.equal(approvalRequired('code.delete_file', { path: '.runtime-data/dev-autonomy/notes.md' }), true);
assert.equal(approvalRequired('gmail.send_email', { to: 'test@example.com', subject: 'x', body: 'x' }), true);
assert.equal(approvalRequired('digitalocean.create_app', { appName: 'x' }), true);

console.log('dev_autonomy profile assertions passed');
