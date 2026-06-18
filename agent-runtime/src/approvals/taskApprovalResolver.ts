import { durableTaskQueue } from '../tasks/queue.js';
import {
  approveDelegatedTask,
  approveExecutionPlanStep,
  getDelegatedTask,
  getDelegatedTaskUiState,
  listDelegatedTasks,
} from '../tasks/store.js';
import type { DelegatedTask } from '../tasks/types.js';

export type PendingApprovalShape = {
  taskId: string;
  scope: 'task' | 'step';
  stepId?: string;
  recency: string;
};

export type ApprovalReceiptShape = {
  action: 'delegation.approve_task' | 'delegation.approve_step';
  taskId: string;
  scope: 'task' | 'step';
  stepId?: string;
  approver: string;
  note: string;
  approvedAt?: string;
  eventId?: string;
};

export type ApprovalResolution = {
  task?: DelegatedTask;
  pendingApproval?: PendingApprovalShape;
  receipt?: ApprovalReceiptShape;
  queued: boolean;
};

function approvalRecency(task: DelegatedTask) {
  return (
    [...task.events]
      .reverse()
      .find((event) => event.eventType === 'task.approval_needed' || event.eventType === 'task.approval_requested')?.occurredAt || task.updatedAt
  );
}

function hasPendingTaskApproval(task: DelegatedTask) {
  return task.approvalRequirements.some((requirement) => requirement.required && requirement.status === 'pending');
}

function pendingStepId(task: DelegatedTask) {
  if (task.pendingToolAction?.approvalStatus === 'pending') return task.pendingToolAction.stepId;
  return task.executionPlan?.find((step) => step.approval?.required && step.approvalStatus === 'pending')?.id;
}

export function pendingApprovalShape(task: DelegatedTask): PendingApprovalShape | undefined {
  const stepId = pendingStepId(task);
  if (stepId) return { taskId: task.id, stepId, recency: approvalRecency(task), scope: 'step' };
  if (hasPendingTaskApproval(task)) return { taskId: task.id, recency: approvalRecency(task), scope: 'task' };
  return undefined;
}

export function pendingApprovalCandidates(tasks: DelegatedTask[]) {
  return tasks
    .map(pendingApprovalShape)
    .filter((candidate): candidate is PendingApprovalShape => Boolean(candidate))
    .sort((a, b) => b.recency.localeCompare(a.recency));
}

function approvalReceipt(task: DelegatedTask, pendingApproval: PendingApprovalShape, approver: string, note: string): ApprovalReceiptShape {
  const latestApprovalEvent = [...task.auditTrail]
    .reverse()
    .find((event) => event.eventType === 'task.approved' && (pendingApproval.scope === 'task' || event.details?.stepId === pendingApproval.stepId));
  const step = pendingApproval.stepId ? task.executionPlan?.find((candidate) => candidate.id === pendingApproval.stepId) : undefined;
  const taskRequirement = pendingApproval.scope === 'task'
    ? [...task.approvalRequirements].reverse().find((requirement) => requirement.required && requirement.status === 'approved')
    : undefined;
  return {
    action: pendingApproval.scope === 'step' ? 'delegation.approve_step' : 'delegation.approve_task',
    taskId: task.id,
    scope: pendingApproval.scope,
    ...(pendingApproval.stepId ? { stepId: pendingApproval.stepId } : {}),
    approver,
    note,
    approvedAt: step?.approval?.approvedAt || taskRequirement?.approvedAt || latestApprovalEvent?.occurredAt,
    eventId: latestApprovalEvent?.id,
  };
}

export async function resolveExplicitTaskApproval(taskId: string, input: { approver?: string; note?: string } = {}): Promise<ApprovalResolution> {
  const existing = await getDelegatedTask(taskId);
  if (!existing) return { queued: false };
  const pendingApproval = pendingApprovalShape(existing) || { taskId, scope: 'task', recency: existing.updatedAt };
  const approver = input.approver || 'user';
  const note = input.note || '';
  const task = pendingApproval.scope === 'step' && pendingApproval.stepId
    ? await approveExecutionPlanStep(taskId, pendingApproval.stepId, approver, note)
    : await approveDelegatedTask(taskId, approver, note);
  if (!task) return { queued: false, pendingApproval };
  if (task.status === 'queued') durableTaskQueue.enqueue(task);
  return { task, pendingApproval, receipt: approvalReceipt(task, pendingApproval, approver, note), queued: task.status === 'queued' };
}

export async function resolveLatestConversationalApproval(sessionId: string, input: { approver?: string; note?: string } = {}): Promise<ApprovalResolution> {
  const latest = pendingApprovalCandidates(await listDelegatedTasks(sessionId))[0];
  if (!latest) return { queued: false };
  return resolveExplicitTaskApproval(latest.taskId, input);
}

export function taskWithUiState(task: DelegatedTask) {
  return { ...task, uiState: getDelegatedTaskUiState(task, durableTaskQueue.snapshot()) };
}
