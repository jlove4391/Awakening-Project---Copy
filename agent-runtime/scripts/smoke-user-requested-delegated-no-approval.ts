#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `user-requested-delegated-no-approval-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = '.runtime-smoke/user-requested-no-approval.txt';
const targetContent = 'User-requested delegated task executed without approval prompt.\n';
const testMarkerPath = '.runtime-smoke/user-requested-test-command.txt';
const sessionId = `smoke-user-requested-delegated-no-approval-${Date.now()}`;
const timeoutMs = Number(process.env.SMOKE_USER_REQUESTED_DELEGATED_NO_APPROVAL_TIMEOUT_MS || 30000);

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;

await mkdir(path.join(workspaceRoot, '.runtime-smoke'), { recursive: true });

const { approveDelegatedTask, createDelegatedTask, getDelegatedTask } = await import('../src/tasks/store.js');
await import('../src/tasks/queue.js');

const { evaluateNexoraCapabilityForStep, requiresHardApprovalGate } = await import('../src/workflows/nexora/capabilities.js');
const { getRegisteredTool } = await import('../src/tools/registry.js');
const commitDefinition = getRegisteredTool('code.commit');
const testDefinition = getRegisteredTool('code.test');
const editDefinition = getRegisteredTool('code.edit');
const driveWriteDefinition = getRegisteredTool('drive.create_text_file');
const gmailSendDefinition = getRegisteredTool('gmail.send_email');
assert.equal(requiresHardApprovalGate(commitDefinition), true, 'commits must remain hard approval gates');
assert.equal(requiresHardApprovalGate(driveWriteDefinition), true, 'provider/account writes must remain hard approval gates');
assert.equal(requiresHardApprovalGate(gmailSendDefinition), true, 'external sends must remain hard approval gates');
assert.equal(requiresHardApprovalGate(testDefinition), false, 'ordinary local tests must not be hard approval gates');
assert.equal(requiresHardApprovalGate(editDefinition), false, 'ordinary local file edits must not be hard approval gates');
assert.equal(evaluateNexoraCapabilityForStep('code.commit', 'pending', 'delegated').reason, 'approval_required');
assert.equal(evaluateNexoraCapabilityForStep('code.test', 'pending', 'delegated').allowed, true);

const task = await createDelegatedTask({
  sessionId,
  objective: `Create ${targetPath} from an explicit user-requested delegated task.`,
  constraints: [`path: ${targetPath}`, `content: ${targetContent.trim()}`],
  requiredTools: ['code.create_file', 'code.test'],
  authorizationSource: 'user_delegated',
  approvalRequirements: ['Would require approval if this were autonomous/proactive.'],
  executionPlan: [
    {
      id: 'create-user-requested-file',
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'write_requires_user_authorization' },
    },
    {
      id: 'run-user-requested-test',
      targetTool: 'code.test',
      arguments: {
        command: `node -e \"require('fs').writeFileSync('${testMarkerPath}', 'test command executed without approval prompt\\n')\"`,
        cwd: '.',
        timeoutMs: 5000,
        maxOutputBytes: 4096,
      },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'test_command_requires_user_authorization' },
    },
  ],
  initialLog: 'Smoke task verifies user-requested delegated execution bypasses approval prompts while preserving audit receipts.',
});

assert.equal(task.authorizationSource, 'user_delegated');
assert.equal(task.status, 'queued');
assert.equal(task.approvalRequirements[0]?.status, 'approved');
assert.equal(task.executionPlan?.[0]?.approvalStatus, 'approved');
assert.equal(task.executionPlan?.[1]?.approvalStatus, 'approved');
assert.ok(task.events.some((event) => event.eventType === 'task.queued'), 'created task should emit queued audit event');
assert.ok(!task.events.some((event) => event.eventType === 'task.approval_needed'), 'user-authorized governance should not create a pending approval item for explicit delegated/user-requested work');

const autonomousTask = await createDelegatedTask({
  sessionId,
  objective: 'Autonomous mutation still requires approval.',
  requiredTools: ['code.create_file'],
  authorizationSource: 'autonomous',
  approvalRequirements: ['Autonomous write must still wait for approval.'],
  executionPlan: [
    {
      id: 'autonomous-patch-proposal',
      targetTool: 'code.patch_file',
      arguments: { path: '.runtime-smoke/autonomous-proposal.txt', search: 'before', replace: 'after' },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'autonomous_patch_proposal_requires_approval' },
    },
  ],
});
assert.equal(autonomousTask.status, 'pending_approval');
assert.equal(autonomousTask.approvalRequirements[0]?.status, 'pending');
assert.equal(autonomousTask.executionPlan?.[0]?.approvalStatus, 'pending');
assert.ok(autonomousTask.events.some((event) => event.eventType === 'task.approval_needed'), 'autonomous patch proposal should create a pending approval item');

const approvedAutonomousTask = await approveDelegatedTask(autonomousTask.id, 'smoke', 'Approve autonomous patch proposal through the canonical task approval route.');
assert.equal(approvedAutonomousTask?.status, 'queued');
assert.equal(approvedAutonomousTask?.approvalRequirements[0]?.status, 'approved');
assert.equal(approvedAutonomousTask?.executionPlan?.[0]?.approvalStatus, 'approved');

const directUserTask = await createDelegatedTask({
  sessionId,
  objective: 'Direct user request also starts without an additional approval prompt.',
  authorizationSource: 'user_requested',
  approvalRequirements: ['Direct request should be treated as already authorized.'],
});
assert.equal(directUserTask.status, 'queued');
assert.equal(directUserTask.approvalRequirements[0]?.status, 'approved');
assert.ok(!directUserTask.events.some((event) => event.eventType === 'task.approval_needed'), 'direct user request should not create a pending approval item');


const hardGateTask = await createDelegatedTask({
  sessionId,
  objective: 'User-delegated high-risk commit must still require explicit approval.',
  requiredTools: ['code.commit'],
  authorizationSource: 'user_delegated',
  executionPlan: [
    {
      id: 'commit-hard-gate',
      targetTool: 'code.commit',
      arguments: { message: 'smoke: should require explicit approval' },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'commit_requires_explicit_approval' },
    },
  ],
});
assert.equal(hardGateTask.status, 'pending_approval', 'high-risk user-delegated commit must wait for canonical task approval');
assert.equal(hardGateTask.executionPlan?.[0]?.approvalStatus, 'pending');
assert.equal(hardGateTask.executionPlan?.[0]?.approval?.status, 'pending');
assert.ok(hardGateTask.events.some((event) => event.eventType === 'task.approval_needed'), 'hard-gated commit should emit approval-needed prompt');

const approvedHardGateTask = await approveDelegatedTask(hardGateTask.id, 'smoke', 'Approve high-risk delegated commit through the canonical task approval route.');
assert.equal(approvedHardGateTask?.status, 'queued');
assert.equal(approvedHardGateTask?.executionPlan?.[0]?.approvalStatus, 'approved');

const finalTask = await waitForTask(task.id, (candidate) => ['completed', 'failed', 'blocked'].includes(candidate.status));
assert.equal(finalTask.status, 'completed', `task should complete without an approval block, got ${finalTask.status}: ${finalTask.blockedReason || finalTask.result?.summary}`);
assert.equal(finalTask.blockedReason, undefined);
assert.ok(!finalTask.events.some((event) => event.eventType === 'task.approval_needed'), 'user-requested delegated task should not emit approval-needed prompt');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), `expected ${targetPath} to exist`);
assert.ok(existsSync(path.join(workspaceRoot, testMarkerPath)), `expected ${testMarkerPath} to exist`);
assert.ok(finalTask.receipt?.id, 'completed task should include a receipt');
assert.ok(finalTask.auditTrail.length > 0, 'completed task should retain audit trail entries');
console.log('User-requested delegated no-approval smoke passed.');

async function waitForTask(taskId: string, predicate: (task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) => boolean) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await getDelegatedTask(taskId);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out after ${timeoutMs}ms waiting for task ${taskId}. Latest status: ${latest?.status}; reason: ${latest?.blockedReason}; result: ${latest?.result?.summary}`);
}
