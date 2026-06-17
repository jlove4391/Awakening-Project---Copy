#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const smokeRoot = path.join(runtimeRoot, '.runtime-data', 'smoke', `delegated-resume-${Date.now()}`);
const workspaceRoot = path.join(smokeRoot, 'workspace');
const dataDir = path.join(smokeRoot, 'data');
const targetPath = '.runtime-smoke/delegated-resume.txt';
const targetContent = 'Nexora delegated resume smoke continued from the approved blocked step.\n';
const sessionId = `smoke-delegated-resume-${Date.now()}`;

process.env.AGENT_RUNTIME_DATA_DIR = dataDir;
process.env.NEXORA_WORKSPACE_ROOT = workspaceRoot;
process.env.NEXORA_ENABLE_WRITE_FILES = 'true';

await mkdir(path.join(workspaceRoot, '.runtime-smoke'), { recursive: true });

const {
  approveDelegatedTask,
  approveExecutionPlanStep,
  createDelegatedTask,
  getDelegatedTask,
  resumeDelegatedTask,
  updateDelegatedTask,
  updateExecutionPlanStep,
} = await import('../src/tasks/store.js');
const { codeCreateFile } = await import('../src/tools/codeTools.js');

console.log('Delegated resume smoke: creating a local file task that blocks for step approval.');

const task = await createDelegatedTask({
  sessionId,
  objective: `Create ${targetPath} in the Nexora workspace after a blocked-step resume.`,
  constraints: [
    `path: ${targetPath}`,
    `content: ${targetContent.trim()}`,
    'Use local Nexora workspace file operations only; provider resume coverage can be tested later.',
  ],
  requiredTools: ['code.create_file'],
  approvalRequirements: ['Approve this delegated task before Nexora may inspect the file-write step.'],
  executionPlan: [
    {
      targetTool: 'code.create_file',
      arguments: { path: targetPath, content: targetContent },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'resume_smoke_file_write_approval_required' },
    },
  ],
  initialLog: 'Smoke task for delegated resume from a blocked local file-write step.',
});

const unrelatedTask = await createDelegatedTask({
  sessionId,
  objective: 'Unrelated delegated resume smoke task used to verify step approval lookup isolation.',
  constraints: ['Must never be resumed by the primary task step approval.'],
  requiredTools: ['code.create_file'],
  approvalRequirements: ['Approve this unrelated task separately.'],
  executionPlan: [
    {
      id: 'unrelated-step',
      targetTool: 'code.create_file',
      arguments: { path: '.runtime-smoke/unrelated.txt', content: 'unrelated\n' },
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'unrelated_step_must_not_match_primary_step' },
    },
  ],
  initialLog: 'Unrelated smoke task for step approval lookup isolation.',
});

assert.equal(task.status, 'pending_approval', 'task should start pending delegated-task approval');
console.log(`✓ Created delegated task ${task.id}.`);

const approvedTask = await approveDelegatedTask(task.id, 'smoke', 'Approve delegated resume smoke task.');
assert.equal(approvedTask?.status, 'queued', 'task should queue after delegated-task approval');
console.log('✓ Approved delegated task.');

await dispatchOnce(task.id);
const blocked = await getRequiredTask(task.id);
assert.equal(blocked.status, 'blocked', `task should block for step approval, got ${blocked.status}`);
assert.equal(blocked.blockedReason, 'step_approval_required');
assert.equal(blocked.pendingToolAction?.toolName, 'code.create_file');
assert.equal(blocked.pendingToolAction?.approvalStatus, 'pending');
const stepId = blocked.pendingToolAction?.stepId;
assert.ok(stepId, 'blocked task should expose the pending code.create_file step ID');
assert.equal(blocked.executionPlan?.find((step) => step.id === stepId)?.status, 'blocked');
console.log(`✓ Worker blocked at file-write step ${stepId}.`);

const wrongTaskApproval = await approveExecutionPlanStep(unrelatedTask.id, stepId, 'smoke', 'This must not approve a step on the wrong task.');
assert.equal(wrongTaskApproval, undefined, 'step approval must look up the step within the original task ID only');
const stillBlocked = await getRequiredTask(task.id);
assert.equal(stillBlocked.status, 'blocked', 'wrong-task step approval attempt must not resume the original blocked task');
assert.equal(stillBlocked.pendingToolAction?.stepId, stepId, 'wrong-task approval attempt must not alter the original pending step payload');
console.log('✓ Step approval lookup stayed scoped to the original task ID.');

const stepApproved = await approveExecutionPlanStep(task.id, stepId, 'smoke', 'Approve code.create_file so resume can continue from this blocked step.');
assert.equal(stepApproved?.status, 'queued', 'task should be queued after step approval');
assert.equal(stepApproved?.executionPlan?.find((step) => step.id === stepId)?.approvalStatus, 'approved');
const stepApprovalEvent = [...(stepApproved?.events || [])].reverse().find((event) => event.eventType === 'task.approved' && event.details?.stepId === stepId);
assert.equal(stepApprovalEvent?.taskId, task.id, 'step approval event must be recorded on the original task');
assert.equal(stepApprovalEvent?.details?.taskId, task.id, 'step approval event details must include the original task ID');
assert.equal(stepApprovalEvent?.details?.stepId, stepId, 'step approval event details must include the original step ID');
assert.deepEqual(stepApprovalEvent?.details?.pendingToolAction, {
  stepId,
  toolName: 'code.create_file',
  arguments: { path: targetPath, content: targetContent },
  argumentTemplate: undefined,
  approvalScope: 'repo.write',
  reason: 'step_approval_required',
});
console.log('✓ Approved the blocked file-write step.');

const resumed = await resumeDelegatedTask(task.id, 'system', 'Smoke resume after local file-write step approval.');
assert.equal(resumed?.status, 'queued', 'resumed task should be queued for worker pickup');
assert.ok(resumed?.events.some((event) => event.eventType === 'task.resumed'), 'resume should record a task.resumed event');
assert.equal(resumed?.executionPlan?.find((step) => step.id === stepId)?.status, 'queued', 'approved blocked step should remain queued for continuation');
const resumeEvent = [...(resumed?.events || [])].reverse().find((event) => event.eventType === 'task.resumed');
assert.equal(resumeEvent?.taskId, task.id, 'resume event must stay on the original task');
assert.ok((resumeEvent?.details?.executionPlanState as Array<{ id: string }> | undefined)?.some((step) => step.id === stepId), 'resume event must include the original step in execution-plan state');
console.log('✓ Resumed the task after step approval.');

await dispatchOnce(task.id);
const finalTask = await getRequiredTask(task.id);
assert.equal(finalTask.status, 'completed', `task should complete after resume, got ${finalTask.status}: ${finalTask.result?.summary || finalTask.blockedReason || 'no result'}`);
const finalStep = finalTask.executionPlan?.find((step) => step.id === stepId);
assert.equal(finalStep?.status, 'completed', 'worker should continue by completing the previously blocked step');
assert.match(finalStep?.resultSummary || '', /code\.create_file/, 'completed step should identify code.create_file');
assert.ok(existsSync(path.join(workspaceRoot, targetPath)), `expected ${targetPath} to exist after resume`);
assert.equal(await readFile(path.join(workspaceRoot, targetPath), 'utf8'), targetContent);
assert.ok(finalTask.receipt?.id, 'completed task should include a receipt ID');
assert.ok(JSON.stringify(finalTask.result).includes(stepId), 'completed result should include the resumed step ID as execution proof');
console.log(`✓ Worker continued from blocked step ${stepId}, completed the task, and created receipt ${finalTask.receipt?.id}.`);
console.log('Delegated resume smoke passed. Output intentionally remains under .runtime-data/smoke/.');

async function dispatchOnce(taskId: string) {
  const current = await getRequiredTask(taskId);
  assert.equal(current.status, 'queued', `task ${taskId} must be queued before dispatch, got ${current.status}`);
  await updateDelegatedTask(taskId, {
    status: 'running',
    event: {
      type: 'task.started',
      actor: 'system',
      summary: 'Smoke dispatched task to local Nexora-style worker without provider resources.',
    },
  });

  const running = await getRequiredTask(taskId);
  const step = [...(running.executionPlan || [])]
    .sort((left, right) => left.order - right.order)
    .find((candidate) => !['completed', 'skipped', 'cancelled'].includes(candidate.status));
  assert.ok(step, 'expected a queued or blocked execution-plan step for local smoke dispatch');

  if (step.approval?.required && step.approvalStatus === 'pending') {
    const pendingToolAction = {
      stepId: step.id,
      toolName: step.targetTool,
      arguments: step.arguments,
      argumentTemplate: step.argumentTemplate,
      approvalStatus: 'pending' as const,
      reason: 'step_approval_required',
      approvalScope: 'repo.write' as const,
    };
    await updateExecutionPlanStep(taskId, step.id, {
      status: 'blocked',
      approvalStatus: 'pending',
      approval: { required: true, status: 'pending', reason: 'step_approval_required', scope: 'repo.write' },
    });
    await updateDelegatedTask(taskId, {
      status: 'blocked',
      blockedReason: 'step_approval_required',
      pendingToolAction,
      log: `Local smoke worker blocked before ${step.targetTool}; explicit approval is required for this step.`,
      event: {
        type: 'task.blocked',
        actor: 'nexora',
        summary: 'Local smoke worker is blocked until the pending tool action is approved.',
        details: { blockedReason: 'step_approval_required', pendingToolAction },
      },
    });
    return;
  }

  assert.equal(step.approvalStatus, 'approved', 'local smoke worker should continue only after the blocked step is approved');
  await updateExecutionPlanStep(taskId, step.id, { status: 'running' });
  const input = { ...((step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments) ? step.arguments : {}) as Record<string, unknown>), confirmedByUser: true, taskId, stepId: step.id };
  assert.equal(step.targetTool, 'code.create_file', 'local resume smoke only executes the local code.create_file tool');
  const result = await codeCreateFile(input as { path: string; content: string; confirmedByUser: boolean; taskId: string; stepId: string });
  await updateExecutionPlanStep(taskId, step.id, { status: 'completed', resultSummary: `Executed ${step.targetTool}.` });
  await updateDelegatedTask(taskId, {
    status: 'completed',
    result: {
      ok: true,
      summary: 'Local smoke worker resumed and executed the approved blocked step.',
      data: {
        handledBy: 'smoke.local-resume-worker',
        continuedFromStepId: step.id,
        executedSteps: [{ stepId: step.id, tool: step.targetTool, input, result }],
      },
    },
    event: {
      type: 'task.completed',
      actor: 'nexora',
      summary: 'Local smoke worker recorded terminal completion after resume.',
      details: { worker: 'smoke.local-resume-worker', continuedFromStepId: step.id },
    },
  });
}

async function getRequiredTask(taskId: string) {
  const latest = await getDelegatedTask(taskId);
  assert.ok(latest, `expected task ${taskId} to exist`);
  return latest;
}
