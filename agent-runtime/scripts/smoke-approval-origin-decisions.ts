#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

process.env.AGENT_RUNTIME_DATA_DIR = await mkdtemp(path.join(tmpdir(), 'approval-origin-decisions-'));

const { runtimeConfig } = await import('../src/config.js');
const { workspaceRoot } = await import('../src/tools/codeTools.js');
const { createDelegatedTask } = await import('../src/tasks/store.js');
const { evaluateNexoraCapabilityForStep } = await import('../src/workflows/nexora/capabilities.js');

const sessionId = 'approval-origin-decisions-smoke';
assert.equal(runtimeConfig.codeWorkspaceRoot.endsWith(path.join('agent-runtime', '.runtime-data', 'sandbox', 'default')), true, 'default Nexora workspace should be the sandbox/default lane');
assert.equal(workspaceRoot().endsWith(path.join('agent-runtime', '.runtime-data', 'sandbox', 'default')), true, 'code tools should resolve the sandbox/default workspace lane');

const reactiveTask = await createDelegatedTask({
  sessionId,
  objective: 'Reactive user request should not require another approval for ordinary local work.',
  authorizationSource: 'user_requested',
  approvalRequirements: ['User directly requested this local change.'],
  executionPlan: [
    {
      id: 'reactive-edit',
      targetTool: 'code.edit',
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'ordinary_local_edit' },
    },
  ],
});
assert.equal(reactiveTask.executionOrigin, 'reactive');
assert.equal(reactiveTask.status, 'queued');
assert.equal(reactiveTask.approvalRequirements[0]?.status, 'approved');
assert.equal(reactiveTask.executionPlan?.[0]?.approvalStatus, 'approved');
assert.ok(reactiveTask.auditTrail.some((event) => event.eventType === 'task.queued'));
assert.ok(!reactiveTask.auditTrail.some((event) => event.eventType === 'task.approval_needed'));

const delegatedTask = await createDelegatedTask({
  sessionId,
  objective: 'Traceable delegated task should not require another approval for ordinary local work.',
  authorizationSource: 'user_delegated',
  parentTaskId: reactiveTask.id,
  approvalRequirements: ['User delegated this ordinary local change through Elora.'],
  executionPlan: [
    {
      id: 'delegated-test',
      targetTool: 'code.test',
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'ordinary_local_test_command' },
    },
  ],
});
assert.equal(delegatedTask.executionOrigin, 'delegated');
assert.equal(delegatedTask.rootTaskId, reactiveTask.rootTaskId);
assert.equal(delegatedTask.status, 'queued');
assert.equal(delegatedTask.approvalRequirements[0]?.status, 'approved');
assert.equal(delegatedTask.executionPlan?.[0]?.approvalStatus, 'approved');
assert.ok(delegatedTask.delegationChain.includes(reactiveTask.id));
assert.ok(delegatedTask.auditTrail.some((event) => event.eventType === 'task.queued'));

const autonomousTask = await createDelegatedTask({
  sessionId,
  objective: 'Autonomous mutation should remain approval gated.',
  authorizationSource: 'autonomous',
  approvalRequirements: ['Autonomous local mutation requires approval.'],
  executionPlan: [
    {
      id: 'autonomous-edit',
      targetTool: 'code.edit',
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'autonomous_mutation' },
    },
  ],
});
assert.equal(autonomousTask.executionOrigin, 'autonomous');
assert.equal(autonomousTask.status, 'pending_approval');
assert.equal(autonomousTask.approvalRequirements[0]?.status, 'pending');
assert.equal(autonomousTask.executionPlan?.[0]?.approvalStatus, 'pending');
assert.ok(autonomousTask.auditTrail.some((event) => event.eventType === 'task.approval_needed'));

const highRiskDelegatedTask = await createDelegatedTask({
  sessionId,
  objective: 'User-delegated high-risk side effect should remain approval gated.',
  authorizationSource: 'user_delegated',
  parentTaskId: reactiveTask.id,
  approvalRequirements: [{ reason: 'External send requires explicit approval.', scope: 'external.send' }],
  executionPlan: [
    {
      id: 'delegated-commit',
      targetTool: 'code.commit',
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'commit_is_high_risk', scope: 'repo.commit' },
    },
  ],
});
assert.equal(highRiskDelegatedTask.executionOrigin, 'delegated');
assert.equal(highRiskDelegatedTask.status, 'pending_approval');
assert.equal(highRiskDelegatedTask.approvalRequirements[0]?.status, 'pending');
assert.equal(highRiskDelegatedTask.executionPlan?.[0]?.approvalStatus, 'pending');
assert.ok(highRiskDelegatedTask.auditTrail.some((event) => event.eventType === 'task.approval_needed'));

assert.equal(evaluateNexoraCapabilityForStep('code.edit', 'pending', 'reactive').allowed, true);
assert.equal(evaluateNexoraCapabilityForStep('code.edit', 'pending', 'delegated').allowed, true);
assert.equal(evaluateNexoraCapabilityForStep('code.edit', 'pending', 'autonomous').allowed, false);
assert.equal(evaluateNexoraCapabilityForStep('code.commit', 'pending', 'delegated').reason, 'approval_required');

console.log('Approval origin decision smoke passed.');
