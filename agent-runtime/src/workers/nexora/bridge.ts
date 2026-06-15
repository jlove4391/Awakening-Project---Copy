import { getDelegatedTask } from '../../tasks/store.js';
import type { RuntimeContext } from '../../types.js';
import { executeLocalNexoraCommand } from './localWorker.js';
import { evaluateNexoraCommandPolicy } from './sandboxPolicy.js';
import type { NexoraCommandResult, NexoraExecutionRequest } from './types.js';

function taskApprovalsSatisfied(task: Awaited<ReturnType<typeof getDelegatedTask>>) {
  if (!task) return false;
  return !task.approvalRequirements.some((requirement) => requirement.required && requirement.status !== 'approved');
}

function hasApprovedExecutionPlanStep(task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>, input: NexoraExecutionRequest, context: RuntimeContext) {
  if (!context.approvedExecutionId || input.confirmedByUser !== true) return false;
  const step = task.executionPlan?.find((candidate) => candidate.id === (input.stepId || context.approvedExecutionId));
  return Boolean(step && step.targetTool === 'delegation.execute_code' && step.approvalStatus === 'approved');
}

export async function executeDelegatedCode(input: NexoraExecutionRequest, context: RuntimeContext): Promise<NexoraCommandResult | Record<string, unknown>> {
  const task = await getDelegatedTask(input.taskId);
  if (!task) return { ok: false, status: 'not_found', taskId: input.taskId };
  if (task.assignedAgent !== 'nexora') return { ok: false, status: 'blocked', reason: 'task_not_assigned_to_nexora', taskId: input.taskId };
  if (!taskApprovalsSatisfied(task)) return { ok: false, status: 'approval_required', reason: 'task_approval_requirements_not_satisfied', taskId: input.taskId };
  if (!hasApprovedExecutionPlanStep(task, input, context)) return { ok: false, status: 'approval_required', reason: 'approved_execution_plan_step_required', taskId: input.taskId };

  const policy = evaluateNexoraCommandPolicy(input);
  if (!policy.ok) return { ok: false, status: 'blocked', reason: policy.reason || 'policy_block', taskId: input.taskId, policy };

  return executeLocalNexoraCommand(input);
}
