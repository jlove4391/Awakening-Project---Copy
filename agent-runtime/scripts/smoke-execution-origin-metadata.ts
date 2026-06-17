import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'awakening-origin-metadata-'));
process.env.AWAKENING_DATA_DIR = dataDir;
process.env.CORE_TESTING_MODE = 'true';

const { createDelegatedTask, completeDelegatedTask } = await import('../src/tasks/store.js');

const direct = await createDelegatedTask({
  sessionId: 'origin-smoke',
  objective: 'Direct user task should be reactive.',
  authorizationSource: 'user_requested',
  approvalRequirements: ['Direct user authorization covers this.'],
  executionPlan: [{ id: 'direct-step', targetTool: 'code.read_file', approvalStatus: 'not_required' }],
});
assert.equal(direct.executionOrigin, 'reactive');
assert.equal(direct.rootTaskId, direct.id);
assert.deepEqual(direct.delegationChain, [direct.id]);
assert.equal(direct.executionPlan?.[0]?.executionOrigin, 'reactive');
assert.equal(direct.executionPlan?.[0]?.rootTaskId, direct.id);
assert.equal(direct.auditTrail[0]?.executionOrigin, 'reactive');

const delegated = await createDelegatedTask({
  sessionId: 'origin-smoke',
  objective: 'Delegated task should preserve the parent chain.',
  authorizationSource: 'user_delegated',
  parentTaskId: direct.id,
  executionPlan: [{ id: 'delegated-step', targetTool: 'code.read_file', approvalStatus: 'not_required' }],
});
assert.equal(delegated.executionOrigin, 'delegated');
assert.equal(delegated.parentTaskId, direct.id);
assert.equal(delegated.rootTaskId, direct.id);
assert.deepEqual(delegated.delegationChain, [direct.id, delegated.id]);
assert.equal(delegated.executionPlan?.[0]?.parentTaskId, direct.id);
assert.equal(delegated.executionPlan?.[0]?.rootTaskId, direct.id);

const autonomous = await createDelegatedTask({
  sessionId: 'origin-smoke',
  objective: 'Autonomous proposed task should remain approval gated.',
  authorizationSource: 'autonomous',
  approvalRequirements: ['Autonomous proposed work requires approval.'],
  executionPlan: [{ id: 'autonomous-step', targetTool: 'code.create_file', approvalStatus: 'pending', approval: { required: true, status: 'pending' } }],
});
assert.equal(autonomous.executionOrigin, 'autonomous');
assert.equal(autonomous.status, 'pending_approval');
assert.equal(autonomous.approvalRequirements[0]?.status, 'pending');
assert.equal(autonomous.executionPlan?.[0]?.executionOrigin, 'autonomous');

const completed = await completeDelegatedTask(delegated.id, { ok: true, summary: 'Delegated task completed with origin metadata.' });
assert.equal(completed?.receipt?.executionOrigin, 'delegated');
assert.equal(completed?.receipt?.parentTaskId, direct.id);
assert.equal(completed?.receipt?.rootTaskId, direct.id);
assert.deepEqual(completed?.receipt?.delegationChain, [direct.id, delegated.id]);
assert.equal(completed?.receipt?.proof.auditTrail.at(-1)?.executionOrigin, 'delegated');

console.log('Execution origin metadata smoke passed.');
