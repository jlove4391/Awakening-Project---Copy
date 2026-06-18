import { resolveLatestConversationalApproval, taskWithUiState } from './taskApprovalResolver.js';
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

export async function resolveConversationalApproval(sessionId: string, note = 'Jordan approved this pending action conversationally by saying "I approve".'): Promise<ConversationalApprovalResolution> {
  const approval = await resolveLatestConversationalApproval(sessionId, { approver: 'Jordan', note });

  if (!approval.task || !approval.pendingApproval) {
    return { handled: true, message: 'There is no pending approval for this session.' };
  }

  const target = approval.pendingApproval.scope === 'step' ? `step ${approval.pendingApproval.stepId} for task ${approval.task.id}` : `task ${approval.task.id}`;
  return {
    handled: true,
    message: `Approved ${target}. I resumed the associated work and will write the normal execution receipt when it completes.`,
    task: taskWithUiState(approval.task),
    resolvedApproval: {
      taskId: approval.task.id,
      stepId: approval.pendingApproval.scope === 'step' ? approval.pendingApproval.stepId : undefined,
      scope: approval.pendingApproval.scope,
    },
  };
}
