import { durableTaskQueue } from '../tasks/queue.js';
import { approveDelegatedTask, approveExecutionPlanStep, getDelegatedTaskUiState, listDelegatedTasks } from '../tasks/store.js';
import type { DelegatedTask } from '../tasks/types.js';

const conversationalApprovalPattern = /^i\s+approve[.!\s]*$/i;

export interface ConversationalApprovalResolution {
  handled: boolean;
  message: string;
  task?: DelegatedTask;
  resolvedApproval?: {
    taskId: string;
    stepId?: string;
    scope: 'task' | 'step';
  };
}

export function isConversationalApprovalIntent(message: string) {
  const normalized = message.trim().replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/\s+/g, ' ');
  return conversationalApprovalPattern.test(normalized);
}

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

function pendingApprovalCandidates(tasks: DelegatedTask[]) {
  return tasks
    .map((task) => {
      const stepId = pendingStepId(task);
      if (stepId) return { task, stepId, recency: approvalRecency(task), scope: 'step' as const };
      if (hasPendingTaskApproval(task)) return { task, recency: approvalRecency(task), scope: 'task' as const };
      return undefined;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.recency.localeCompare(a.recency));
}

export async function resolveConversationalApproval(sessionId: string, note = 'Jordan approved this pending action conversationally by saying "I approve".'): Promise<ConversationalApprovalResolution> {
  const sessionTasks = await listDelegatedTasks(sessionId);
  const latest = pendingApprovalCandidates(sessionTasks)[0];

  if (!latest) {
    return { handled: true, message: 'There is no pending approval for this session.' };
  }

  const approver = 'Jordan';
  const task = latest.scope === 'step'
    ? await approveExecutionPlanStep(latest.task.id, latest.stepId, approver, note)
    : await approveDelegatedTask(latest.task.id, approver, note);

  if (!task) {
    return { handled: true, message: 'There is no pending approval for this session.' };
  }

  if (task.status === 'queued') durableTaskQueue.enqueue(task);

  const taskState = getDelegatedTaskUiState(task, durableTaskQueue.snapshot());
  const target = latest.scope === 'step' ? `step ${latest.stepId} for task ${task.id}` : `task ${task.id}`;
  return {
    handled: true,
    message: `Approved ${target}. I resumed the associated work and will write the normal execution receipt when it completes.`,
    task: { ...task, uiState: taskState },
    resolvedApproval: { taskId: task.id, stepId: latest.scope === 'step' ? latest.stepId : undefined, scope: latest.scope },
  };
}
