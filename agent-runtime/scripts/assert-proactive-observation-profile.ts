import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MemorySession } from '@openai/agents';
import { getRegisteredTool, executeRegisteredTool } from '../src/tools/registry.js';
import {
  proactiveObservationProfile,
  requiresApprovalForAutonomyProfile,
  requiresApprovalForExecutionMode,
} from '../src/governance/autonomyProfiles.js';
import type { RuntimeContext } from '../src/types.js';

function tool(name: string) {
  const definition = getRegisteredTool(name);
  assert(definition, `expected registered tool ${name}`);
  return definition;
}

assert.equal(proactiveObservationProfile.name, 'proactive_observation');
assert.equal(proactiveObservationProfile.schedulerMode, 'observation');
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('code.read'), { path: 'agent-runtime/src/types.ts' }), false);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('observation.recommend'), { title: 'x' }), false);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('code.create_file'), { path: '.runtime-data/dev-autonomy/notes.md', content: 'draft' }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('code.edit'), { path: 'agent-runtime/src/types.ts', content: 'edit' }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('code.run_command'), { command: 'npm test', cwd: '.' }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('code.commit'), { message: 'commit' }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('code.delete_file'), { path: 'notes.md' }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('gmail.send_email'), { to: 'test@example.com', subject: 'x', body: 'x' }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('sheets.update_range'), { spreadsheetId: 's', range: 'A1', values: [['x']] }), true);
assert.equal(requiresApprovalForAutonomyProfile('proactive_observation', tool('digitalocean.create_app'), { appName: 'x' }), true);
assert.equal(requiresApprovalForExecutionMode('observation', undefined, tool('code.edit'), { path: 'x', content: 'y' }, 'repo.write'), true);

const context: RuntimeContext = {
  sessionId: 'observation-test',
  session: new MemorySession({ sessionId: 'observation-test' }),
  record: { id: 'observation-test', provider: 'local-memory', memories: [], tasks: [], updatedAt: new Date().toISOString() },
  agent: 'elora',
  autonomyProfile: 'proactive_observation',
  autonomyLevel: 2,
  executionMode: 'observation',
};

const recommendation = await executeRegisteredTool('observation.recommend', {
  title: 'Inspect approval policy',
  summary: 'Observation mode should be read-only except auditable recommendations.',
  rationale: 'The policy links recommendations to source evidence while avoiding repo mutation.',
  recommendedAction: 'Have a human review the linked files before approving any implementation task.',
  links: [{ type: 'file', id: 'agent-runtime/src/governance/autonomyProfiles.ts' }],
  affectedPaths: ['agent-runtime/src/governance/autonomyProfiles.ts'],
  confidence: 0.82,
  risk: 'low',
  draft: 'Internal draft only.',
}, context) as { id?: string; mode?: string; links?: Array<{ type: string; id: string }>; affectedPaths?: string[]; confidence?: number; risk?: string };

assert.equal(typeof recommendation.id, 'string');
assert.equal(recommendation.mode, 'observation');
assert.deepEqual(recommendation.links, [{ type: 'file', id: 'agent-runtime/src/governance/autonomyProfiles.ts' }]);
assert.deepEqual(recommendation.affectedPaths, ['agent-runtime/src/governance/autonomyProfiles.ts']);
assert.equal(recommendation.confidence, 0.82);
assert.equal(recommendation.risk, 'low');

const blockedPath = '.runtime-data/dev-autonomy/observation-should-not-write.txt';
const absoluteBlockedPath = path.resolve(process.cwd(), blockedPath);
assert.equal(existsSync(absoluteBlockedPath), false, 'blocked observation target should not exist before attempted write');

const blocked = await executeRegisteredTool('code.create_file', {
  path: blockedPath,
  content: 'must not be written',
  confirmedByUser: true,
}, { ...context, approvedExecutionId: 'fake-approved-id' }) as { result?: { status?: string; reason?: string } };
assert.equal(blocked.result?.status, 'approval_required');
assert.equal(blocked.result?.reason, 'observation_mode_read_only_policy');
assert.equal(existsSync(absoluteBlockedPath), false, 'observation mode must not create or modify files');

console.log('proactive observation profile assertions passed');
