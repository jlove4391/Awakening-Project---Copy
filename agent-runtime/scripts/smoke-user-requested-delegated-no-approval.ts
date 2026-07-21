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

const { requiresHardApprovalGate } = await import('../src/workflows/nexora/capabilities.js');
const { requiresApprovalForExecutionMode } = await import('../src/governance/autonomyProfiles.js');
const { getRegisteredTool } = await import('../src/tools/registry.js');
const commitDefinition = getRegisteredTool('code.commit');
const testDefinition = getRegisteredTool('code.test');
const editDefinition = getRegisteredTool('code.edit');
const driveWriteDefinition = getRegisteredTool('drive.create_text_file');
const gmailSendDefinition = getRegisteredTool('gmail.send_email');
const deleteDefinition = getRegisteredTool('code.delete_file');
const providerCreateDefinition = getRegisteredTool('digitalocean.create_infrastructure');
assert.equal(requiresHardApprovalGate(commitDefinition), true, 'commits must remain hard approval gates');
assert.equal(requiresHardApprovalGate(driveWriteDefinition), true, 'provider/account writes must remain hard approval gates');
assert.equal(requiresHardApprovalGate(gmailSendDefinition), true, 'external sends must remain hard approval gates');
assert.equal(requiresHardApprovalGate(deleteDefinition), true, 'deletes must remain hard approval gates');
assert.equal(requiresHardApprovalGate(providerCreateDefinition), true, 'deploy/provider writes must remain hard approval gates');
assert.equal(requiresHardApprovalGate(testDefinition), false, 'ordinary local tests must not be hard approval gates');
assert.equal(requiresHardApprovalGate(editDefinition), false, 'ordinary local file edits must not be hard approval gates');
assert.equal(requiresApprovalForExecutionMode('delegated', undefined, testDefinition!, {}, 'repo.command'), false, 'delegated local test commands are auto-executable');
assert.equal(requiresApprovalForExecutionMode('delegated', undefined, editDefinition!, {}, 'repo.write'), false, 'delegated ordinary file edits are auto-executable');
assert.equal(requiresApprovalForExecutionMode('delegated', undefined, commitDefinition!, {}, 'repo.commit'), true, 'delegated commits stay hard-gated');
assert.equal(requiresApprovalForExecutionMode('delegated', undefined, deleteDefinition!, {}, 'repo.delete'), true, 'delegated deletes stay hard-gated');
assert.equal(requiresApprovalForExecutionMode('delegated', undefined, providerCreateDefinition!, {}, 'provider.create'), true, 'delegated provider writes and deploys stay hard-gated');
assert.equal(requiresApprovalForExecutionMode('delegated', undefined, gmailSendDefinition!, {}, 'external.send'), true, 'delegated external sends stay hard-gated');

const task = await createDelegatedTask({
  sessionId,
  objective: `Create ${targetPath} from an explicit user-requested delegated task.`,
  constraints: [`path: ${targetPath}`, `content: ${targetContent.trim()}`],
  requiredTools: ['code.create_file', 'code.test'],
  authorizationSource: 'user_delegated',
  approvalRequirements: ['The direct user delegation supplies authority for ordinary local execution.'],
  executionPlan: [
    {
      id: 'create-user-requested-file',
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'write_requested_by_user' },
    },
    {
      id: 'run-user-requested-test',
      targetTool: 'code.test',
      arguments: {
        command: `node -e "require('fs').writeFileSync('${testMarkerPath}', 'test command executed without approval prompt\\n')"`,
        cwd: '.',
        timeoutMs: 5000,
        maxOutputBytes: 4096,
      },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'test_requested_by_user' },
    },
  ],
  initialLog: 'Smoke task verifies user-requested delegated execution bypasses redundant approval prompts while preserving audit receipts.',
});

assert.equal(task.authorizationSource, 'user_delegated');
assert.equal(task.status, 'queued');
assert.equal(task.approvalRequirements[0]?.status, 'approved');
assert.equal(task.executionPlan?.[0]?.approvalStatus, 'not_required');
assert.equal(task.executionPlan?.[1]?.approvalStatus, 'not_required');
assert.ok(task.events.some((event) => event.eventType === 'task.queued'), 'created task should emit queued audit event');
assert.ok(!task.events.some((event) => event.eventType === 'task.approval_needed'), 'ordinary explicit delegated work should not create a pending approval item');

const autonomousTask = await createDelegatedTask({
  sessionId,
  objective: 'Autonomous mutation remains supervised until its task authority is approved.',
  requiredTools: ['code.patch_file'],
  authorizationSource: 'autonomous',
  approvalRequirements: ['Autonomous mutation must wait for task approval under the current supervised envelope.'],
  executionPlan: [
    {
      id: 'autonomous-patch-proposal',
      targetTool: 'code.patch_file',
      arguments: { path: '.runtime-smoke/autonomous-proposal.txt', search: 'before', replace: 'after' },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'autonomous_task_authority_required' },
    },
  ],
});
assert.equal(autonomousTask.status, 'pending_approval');
assert.equal(autonomousTask.approvalRequirements[0]?.status, 'pending');
assert.equal(autonomousTask.executionPlan?.[0]?.approvalStatus, 'not_required', 'ordinary patch policy is separate from the task-level autonomous authority gate');
assert.ok(autonomousTask.events.some((event) => event.eventType === 'task.approval_needed'), 'autonomous task should create a pending approval item');

const approvedAutonomousTask = await approveDelegatedTask(autonomousTask.id, 'smoke', 'Approve the supervised autonomous task through the canonical task approval route.');
assert.equal(approvedAutonomousTask?.status, 'queued');
assert.equal(approvedAutonomousTask?.approvalRequirements[0]?.status, 'approved');

const directUserTask = await createDelegatedTask({
  sessionId,
  objective: 'Direct user request also starts without an additional approval prompt.',
  authorizationSource: 'user_requested',
  approvalRequirements: ['Direct request should be treated as already authorized.'],
});
assert.equal(directUserTask.status, 'queued');
assert.equal(directUserTask.approvalRequirements[0]?.status, 'approved');
assert.ok(!directUserTask.events.some((event) => event.eventType === 'task.approval_needed'), 'direct user request should not create a pending approval item');

const explicitBoundaryTask = await createDelegatedTask({
  sessionId,
  objective: 'A permanent delegated delete must still require explicit approval.',
  requiredTools: ['code.delete_file'],
  authorizationSource: 'user_delegated',
  executionPlan: [
    {
      id: 'permanent-delete-boundary',
      targetTool: 'code.delete_file',
      arguments: {
        path: targetPath,
        permanent: true,
        permanentApprovalNote: 'Permanent deletion remains a separate explicit boundary.',
      },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'permanent_delete_requires_explicit_approval', scope: 'repo.delete' },
    },
  ],
});
assert.equal(explicitBoundaryTask.status, 'pending_approval', 'permanent deletion must remain in the canonical approval queue');
assert.equal(explicitBoundaryTask.executionPlan?.[0]?.approvalStatus, 'pending');
assert.ok(explicitBoundaryTask.events.some((event) => event.eventType === 'task.approval_needed'), 'explicit boundary should emit approval-needed state');

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
    const candidate = await getDelegatedTask(taskId);
    if (candidate && predicate(candidate)) return candidate;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out after ${timeoutMs}ms waiting for task ${taskId}. Latest status: ${latest?.status}; reason: ${latest?.blockedReason}; result: ${latest?.result?.summary}`);
}
