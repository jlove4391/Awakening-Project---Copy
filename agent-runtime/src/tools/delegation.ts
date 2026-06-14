import { durableTaskQueue } from '../tasks/queue.js';
import {
  approveDelegatedTask,
  approveExecutionPlanStep,
  completeDelegatedTask,
  createDelegatedTask,
  getDelegatedTask,
  listDelegatedTasks,
  updateDelegatedTask,
} from '../tasks/store.js';
import type { RuntimeContext } from '../types.js';

export async function createDelegationTask(
  input: {
    objective: string;
    constraints?: string[];
    requiredTools?: string[];
    approvalRequirements?: string[];
    initialLog?: string;
    executionPlan?: any[];
  },
  context: RuntimeContext,
) {
  const task = await createDelegatedTask({
    sessionId: context.sessionId,
    objective: input.objective,
    constraints: input.constraints || [],
    requiredTools: input.requiredTools || [],
    approvalRequirements: input.approvalRequirements || [],
    initialLog: input.initialLog,
    executionPlan: input.executionPlan,
  });
  if (task.status === 'queued') durableTaskQueue.enqueue(task);
  return task;
}

export async function listDelegationTasks(_input: { includeAllSessions?: boolean }, context: RuntimeContext) {
  return listDelegatedTasks(_input.includeAllSessions ? undefined : context.sessionId);
}

export async function getDelegationTask(input: { taskId: string }) {
  const task = await getDelegatedTask(input.taskId);
  return task || { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function approveDelegationTask(input: { taskId: string; approver?: string; note?: string }) {
  const task = await approveDelegatedTask(input.taskId, input.approver || 'user', input.note || '');
  if (task?.status === 'queued') durableTaskQueue.enqueue(task);
  return task || { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function recordDelegationTaskResult(input: { taskId: string; ok: boolean; summary: string; data?: unknown; errorMessage?: string }) {
  const task = await completeDelegatedTask(input.taskId, {
    ok: input.ok,
    summary: input.summary,
    data: input.data,
    ...(input.errorMessage ? { error: { message: input.errorMessage } } : {}),
  });
  return task || { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function updateDelegationTask(input: { taskId: string; status?: any; log?: string }) {
  const task = await updateDelegatedTask(input.taskId, { status: input.status, log: input.log });
  return task || { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function approveDelegationStep(input: { taskId: string; stepId: string; approver?: string; note?: string }) {
  const task = await approveExecutionPlanStep(input.taskId, input.stepId, input.approver || 'user', input.note || '');
  if (task?.status === 'queued') durableTaskQueue.enqueue(task);
  return task || { ok: false, status: 'not_found', taskId: input.taskId, stepId: input.stepId };
}
