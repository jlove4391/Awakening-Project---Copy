import { durableTaskQueue } from '../tasks/queue.js';
import {
  approveDelegatedTask,
  approveExecutionPlanStep,
  cancelDelegatedTask,
  completeDelegatedTask,
  createDelegatedTask,
  getDelegatedTask,
  listDelegatedTasks,
  updateDelegatedTask,
  createAutonomousImprovementProposal,
} from '../tasks/store.js';
import { enrichTaskWithNexoraWorkOrder } from '../tasks/workOrders.js';
import { cancelActiveNexoraCommand } from '../workers/nexora/localWorker.js';
import type { RuntimeContext } from '../types.js';

async function enriched<T>(task: T, context?: RuntimeContext) {
  if (!task || typeof task !== 'object' || !('assignedAgent' in task)) return task;
  return enrichTaskWithNexoraWorkOrder(task as any, context);
}

export async function createDelegationTask(
  input: {
    objective: string;
    constraints?: string[];
    requiredTools?: string[];
    approvalRequirements?: string[];
    initialLog?: string;
    executionPlan?: any[];
    timeoutMs?: number;
    authorizationSource?: 'user_requested' | 'user_delegated' | 'autonomous';
    assignedAgent?: 'nexora' | 'kaz' | 'caz' | 'jynx' | 'kalyra';
    memoryContext?: unknown[];
    outputContract?: { deliverable?: string; expected_format?: 'summary' | 'structured_result' | 'plan' | 'receipt' };
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
    timeoutMs: input.timeoutMs,
    authorizationSource: input.authorizationSource || 'user_delegated',
    assignedAgent: input.assignedAgent,
    memoryContext: input.memoryContext,
    outputContract: input.outputContract,
  });
  const result = await enriched(task, context);
  if (task.status === 'queued' && task.assignedAgent === 'nexora') durableTaskQueue.enqueue(task);
  return result;
}

export async function listDelegationTasks(_input: { includeAllSessions?: boolean }, context: RuntimeContext) {
  const tasks = await listDelegatedTasks(_input.includeAllSessions ? undefined : context.sessionId);
  return Promise.all(tasks.map((task) => enriched(task, context)));
}

export async function getDelegationTask(input: { taskId: string }, context?: RuntimeContext) {
  const task = await getDelegatedTask(input.taskId);
  return task ? enriched(task, context) : { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function createAutonomousProposal(input: {
  taskId: string;
  title: string;
  summary: string;
  rationale: string;
  affectedFiles?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
  proposedDiff?: string;
  implementationNotes?: string;
  changes?: unknown[];
  proposedBy?: 'core' | 'elora' | 'nexora';
}) {
  const task = await createAutonomousImprovementProposal(input.taskId, {
    title: input.title,
    summary: input.summary,
    rationale: input.rationale,
    affectedFiles: input.affectedFiles || [],
    riskLevel: input.riskLevel || 'medium',
    proposedDiff: input.proposedDiff,
    implementationNotes: input.implementationNotes,
    changes: input.changes,
    proposedBy: input.proposedBy || 'nexora',
  });
  return task ? enriched(task) : { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function approveDelegationTask(input: { taskId: string; approver?: string; note?: string }) {
  const task = await approveDelegatedTask(input.taskId, input.approver || 'user', input.note || '');
  if (task?.status === 'queued') durableTaskQueue.enqueueById(task.id);
  return task ? enriched(task) : { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function recordDelegationTaskResult(input: { taskId: string; ok: boolean; summary: string; data?: unknown; errorMessage?: string }) {
  const task = await completeDelegatedTask(input.taskId, {
    ok: input.ok,
    summary: input.summary,
    data: input.data,
    ...(input.errorMessage ? { error: { message: input.errorMessage } } : {}),
  });
  return task ? enriched(task) : { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function updateDelegationTask(input: { taskId: string; status?: any; log?: string }) {
  const task = await updateDelegatedTask(input.taskId, { status: input.status, log: input.log });
  if (task?.status === 'queued') durableTaskQueue.enqueueById(task.id);
  return task ? enriched(task) : { ok: false, status: 'not_found', taskId: input.taskId };
}

export async function resumeDelegationTask(input: { taskId: string; note?: string }) {
  const task = await durableTaskQueue.enqueueById(input.taskId, input.note || undefined);
  return task ? enriched(task) : { ok: false, status: 'not_found_or_not_queueable', taskId: input.taskId };
}

export async function approveDelegationStep(input: { taskId: string; stepId: string; approver?: string; note?: string }) {
  const task = await approveExecutionPlanStep(input.taskId, input.stepId, input.approver || 'user', input.note || '');
  if (task?.status === 'queued') durableTaskQueue.enqueueById(task.id);
  return task ? enriched(task) : { ok: false, status: 'not_found', taskId: input.taskId, stepId: input.stepId };
}

export async function cancelDelegationTask(input: { taskId: string; reason?: string }) {
  cancelActiveNexoraCommand(input.taskId, input.reason || 'Task cancellation requested.');
  const task = await durableTaskQueue.cancel(input.taskId, input.reason || 'Task cancellation requested.', 'user');
  return task ? enriched(task) : { ok: false, status: 'not_found', taskId: input.taskId };
}
