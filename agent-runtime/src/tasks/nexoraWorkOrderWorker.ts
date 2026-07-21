import type { RegisteredToolDefinition } from '../tools/registry.js';
import { decidePolicyForToolName, policyBlocksExecution, policyRequiresApproval } from '../governance/policyDecision.js';
import { getRelationshipContext } from '../relationship/relationshipService.js';
import type { RuntimeContext } from '../types.js';
import { evaluateNexoraCapabilityForStep, isAllowedUserRequestedOrDelegatedCoreTool } from '../workflows/nexora/capabilities.js';
import { redactForLogs } from '../workflows/nexora/secretsPolicy.js';
import type { DelegatedTaskHandler } from './queue.js';
import {
  appendExecutionPlanStep,
  getDelegatedTask,
  updateDelegatedTask,
  updateExecutionPlanStep,
} from './store.js';
import type { DelegatedTask, ExecutionPlanStep } from './types.js';
import {
  createNexoraWorkOrderForTask,
  getNexoraWorkOrderByTaskId,
  patchNexoraWorkOrder,
  transitionNexoraWorkOrder,
  type NexoraWorkOrder,
  type NexoraWorkOrderPlanStep,
  type NexoraWorkOrderValidationCheck,
} from './workOrders.js';

const mutationTools = new Set([
  'code.edit',
  'code.create_file',
  'code.patch_file',
  'code.move_path',
  'code.copy_path',
  'code.mkdir',
  'code.write_json',
  'code.git_restore_file',
  'code.delete_file',
  'code.delete_path',
]);
const commandTools = new Set(['code.run_command', 'code.test', 'delegation.execute_code']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function stepInput(step: ExecutionPlanStep): Record<string, unknown> {
  const value = step.arguments ?? step.argumentTemplate ?? {};
  return isRecord(value) ? { ...value } : { value };
}

function resultSummary(result: unknown) {
  if (typeof result === 'string') return result.slice(0, 500);
  if (result === undefined) return 'No result body returned.';
  if (result === null) return 'Result was null.';
  if (typeof result === 'boolean' || typeof result === 'number') return String(result);
  if (isRecord(result)) {
    const summary = text(result.summary) || text(result.message);
    const status = text(result.status);
    const id = text(result.id);
    const parts = [summary, status ? `status=${status}` : '', id ? `id=${id}` : ''].filter(Boolean);
    if (parts.length) return parts.join('; ').slice(0, 500);
  }
  try {
    return JSON.stringify(redactForLogs(result)).slice(0, 500);
  } catch (_error) {
    return 'Result could not be summarized.';
  }
}

function resultFailed(result: unknown) {
  if (!isRecord(result)) return false;
  if (result.ok === false) return true;
  const status = text(result.status).toLowerCase();
  return ['failed', 'error', 'blocked', 'approval_required', 'provider_not_configured'].includes(status);
}

function providerConfigurationMessage(message: string) {
  return /not configured|missing credential|oauth|access token|refresh token|api key|client secret|invalid_grant|provider configuration/i.test(message);
}

function pathValues(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (/^(path|file|filePath|targetPath|destination|to|workingDirectory)$/i.test(key) && typeof entry === 'string' && entry.trim()) {
      paths.push(entry.trim().replace(/\\/g, '/'));
    }
  }
  return unique(paths);
}

function commandValue(value: unknown) {
  if (!isRecord(value)) return undefined;
  return text(value.command) || text(value.script) || undefined;
}

function pathAllowed(candidate: string, workOrder: NexoraWorkOrder) {
  const normalized = candidate.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return false;
  if (workOrder.scope.deniedPaths.some((denied) => normalized === denied || normalized.startsWith(`${denied}/`))) return false;
  return workOrder.scope.allowedPaths.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\\/g, '/').replace(/^\.\//, '');
    return normalizedAllowed === '.' || normalized === normalizedAllowed || normalized.startsWith(`${normalizedAllowed}/`);
  });
}

function enforceWorkOrderScope(step: ExecutionPlanStep, workOrder: NexoraWorkOrder) {
  if (step.targetTool === 'code.commit' && !workOrder.scope.allowGitCommit) {
    throw new Error('Work order does not authorize a Git commit. Commits remain an explicit human boundary.');
  }
  if (commandTools.has(step.targetTool) && !workOrder.scope.allowCommands) {
    throw new Error(`Work order does not authorize command execution for ${step.targetTool}.`);
  }
  for (const candidate of pathValues(stepInput(step))) {
    if (!pathAllowed(candidate, workOrder)) throw new Error(`Path ${candidate} is outside the declared work-order scope.`);
  }
}

async function loadRegistry() {
  return import('../tools/registry.js');
}

function approvalScopeForStep(definition: RegisteredToolDefinition | undefined) {
  if (!definition || definition.riskLevel === 'read') return undefined;
  if (definition.requiredApprovalScope) return definition.requiredApprovalScope;
  if (definition.name === 'code.commit') return 'repo.commit' as const;
  if (definition.riskLevel === 'code_execution') return 'repo.command' as const;
  if (definition.audit.category === 'code' || definition.audit.category === 'nexora') {
    return definition.audit.action.includes('delete') ? ('repo.delete' as const) : ('repo.write' as const);
  }
  if (definition.riskLevel === 'external_send') return 'external.send' as const;
  if (definition.name.includes('migrate') || definition.audit.action.includes('migrate')) return 'database.migrate' as const;
  if (definition.audit.action.includes('delete')) return 'provider.delete' as const;
  if (definition.audit.action.includes('create')) return 'provider.create' as const;
  return 'provider.update' as const;
}

async function createRuntimeContext(task: DelegatedTask, workOrder: NexoraWorkOrder): Promise<RuntimeContext> {
  const context: RuntimeContext = {
    sessionId: task.sessionId,
    agent: 'nexora',
    channel: 'text',
    executionMode: task.executionOrigin,
    ...(workOrder.contextReferences.commandId ? { commandId: workOrder.contextReferences.commandId } : {}),
    session: undefined as unknown as RuntimeContext['session'],
    record: {
      id: task.sessionId,
      provider: 'local-memory',
      memories: [],
      tasks: [],
      updatedAt: new Date().toISOString(),
    },
  };
  context.relationshipContext = await getRelationshipContext('jordan');
  if (workOrder.contextReferences.contextBundleId) {
    const { getCoreContextBundle } = await import('../core/index.js');
    context.coreContext = await getCoreContextBundle(workOrder.contextReferences.contextBundleId);
  }
  return context;
}

async function ensurePersistedExecutionPlan(task: DelegatedTask, workOrder: NexoraWorkOrder) {
  if (task.executionPlan?.length) return task;
  const appended: ExecutionPlanStep[] = [];
  for (const workStep of workOrder.executionPlan) {
    const updated = await appendExecutionPlanStep(task.id, {
      targetTool: workStep.tool,
      arguments: workStep.arguments,
      status: 'queued',
      approvalStatus: workStep.approvalStatus,
      executionOrigin: task.executionOrigin,
    });
    const step = updated?.executionPlan?.slice().sort((left, right) => left.order - right.order).at(-1);
    if (step) appended.push(step);
  }
  const latest = await getDelegatedTask(task.id);
  if (!latest?.executionPlan?.length) throw new Error('Nexora work order could not persist an executable plan.');
  const executionPlan: NexoraWorkOrderPlanStep[] = workOrder.executionPlan.map((step, index) => ({
    ...step,
    taskStepId: appended[index]?.id || latest.executionPlan?.[index]?.id,
    status: appended[index]?.status || latest.executionPlan?.[index]?.status || step.status,
    approvalStatus: appended[index]?.approvalStatus || latest.executionPlan?.[index]?.approvalStatus || step.approvalStatus,
  }));
  await patchNexoraWorkOrder(task.id, { executionPlan });
  return latest;
}

async function blockStep(task: DelegatedTask, step: ExecutionPlanStep, message: string, reason: 'step_approval_required' | 'provider_configuration_required' | 'policy_block', details: Record<string, unknown> = {}) {
  const { getRegisteredTool } = await loadRegistry();
  const definition = getRegisteredTool(step.targetTool);
  const pendingToolAction = {
    stepId: step.id,
    toolName: step.targetTool,
    riskLevel: definition?.riskLevel,
    action: definition?.audit.action,
    arguments: step.arguments,
    argumentTemplate: step.argumentTemplate,
    approvalStatus: 'pending' as const,
    reason: message,
    approvalScope: approvalScopeForStep(definition),
  };
  await updateExecutionPlanStep(task.id, step.id, {
    status: 'blocked',
    approvalStatus: reason === 'step_approval_required' ? 'pending' : step.approvalStatus,
    ...(reason === 'step_approval_required'
      ? { approval: { required: true, status: 'pending', reason: message, scope: approvalScopeForStep(definition) } }
      : {}),
    resultSummary: message,
  });
  await transitionNexoraWorkOrder(task.id, 'blocked', {
    actor: 'nexora',
    summary: message,
    details: { stepId: step.id, tool: step.targetTool, reason, ...details },
  });
  await updateDelegatedTask(task.id, {
    status: 'blocked',
    blockedReason: reason,
    pendingToolAction,
    log: message,
    event: {
      type: 'task.blocked',
      actor: 'nexora',
      summary: message,
      details: redactForLogs({ stepId: step.id, tool: step.targetTool, reason, ...details }) as Record<string, unknown>,
    },
  });
}

async function executeStep(task: DelegatedTask, workOrder: NexoraWorkOrder, step: ExecutionPlanStep, context: RuntimeContext) {
  const input = stepInput(step);
  enforceWorkOrderScope(step, workOrder);
  const registry = await loadRegistry();
  const definition = registry.getRegisteredTool(step.targetTool);
  const policyDecision = definition ? decidePolicyForToolName(definition.name, input) : decidePolicyForToolName(step.targetTool, input);
  const requiresApproval = policyRequiresApproval(policyDecision);
  const blockedByPolicy = policyBlocksExecution(policyDecision);
  let capabilityDecision = evaluateNexoraCapabilityForStep(step.targetTool, requiresApproval ? step.approvalStatus : 'not_required', task.executionOrigin);

  if (!capabilityDecision.allowed && capabilityDecision.reason === 'approval_required' && !requiresApproval && isAllowedUserRequestedOrDelegatedCoreTool(step.targetTool, task.executionOrigin, definition)) {
    await updateExecutionPlanStep(task.id, step.id, {
      approvalStatus: 'approved',
      approval: {
        required: true,
        status: 'approved',
        approver: 'user_authorized_execution_mode',
        approvedAt: new Date().toISOString(),
        note: 'Authorized by the explicit user-requested or delegated work order.',
        reason: 'user_authorized_delegated_execution',
        scope: approvalScopeForStep(definition),
      },
    });
    step.approvalStatus = 'approved';
    capabilityDecision = evaluateNexoraCapabilityForStep(step.targetTool, 'approved', task.executionOrigin);
  }

  if (blockedByPolicy || (requiresApproval && step.approvalStatus !== 'approved')) {
    await blockStep(task, step, policyDecision.reason, policyDecision.decision === 'setup_needed' ? 'provider_configuration_required' : policyDecision.decision === 'escalate' ? 'step_approval_required' : 'policy_block', { policyDecision });
    return { blocked: true as const };
  }
  if (!capabilityDecision.allowed) {
    const reason = capabilityDecision.reason === 'approval_required' ? 'step_approval_required' : 'policy_block';
    await blockStep(task, step, capabilityDecision.message || `Nexora capability rejected ${step.targetTool}.`, reason, { capabilityDecision });
    return { blocked: true as const };
  }

  if (step.status === 'running' && mutationTools.has(step.targetTool)) {
    await blockStep(
      task,
      step,
      `Interrupted mutating step ${step.id} requires reconciliation before it can be retried; CORE will not repeat a possibly completed write after restart.`,
      'policy_block',
      { interruptedStep: true },
    );
    return { blocked: true as const };
  }
  if (step.status === 'running') await updateExecutionPlanStep(task.id, step.id, { status: 'queued', resultSummary: 'Safe interrupted step reset for restart recovery.' });

  const executableInput = { ...input };
  if (requiresApproval && step.approvalStatus === 'approved') {
    executableInput.confirmedByUser = true;
    context.approvedExecutionId = step.id;
  } else {
    context.approvedExecutionId = undefined;
  }

  await updateExecutionPlanStep(task.id, step.id, { status: 'running' });
  try {
    const result = await registry.executeRegisteredTool(step.targetTool, executableInput, context);
    if (resultFailed(result)) {
      const summary = resultSummary(result);
      if (/approval|required|pending/i.test(summary)) {
        await blockStep(task, step, summary, 'step_approval_required');
        return { blocked: true as const };
      }
      if (providerConfigurationMessage(summary)) {
        await blockStep(task, step, summary, 'provider_configuration_required');
        return { blocked: true as const };
      }
      throw new Error(summary);
    }
    const summary = resultSummary(result);
    await updateExecutionPlanStep(task.id, step.id, { status: 'completed', resultSummary: summary });
    return { blocked: false as const, result, summary, input: executableInput };
  } catch (error) {
    const message = text(error instanceof Error ? error.message : String(error)) || 'Unknown Nexora execution failure.';
    if (providerConfigurationMessage(message)) {
      await blockStep(task, step, message, 'provider_configuration_required');
      return { blocked: true as const };
    }
    await updateExecutionPlanStep(task.id, step.id, { status: 'failed', resultSummary: message });
    throw error;
  }
}

function artifactPathsForStep(step: ExecutionPlanStep) {
  return mutationTools.has(step.targetTool) ? pathValues(stepInput(step)) : [];
}

function workOrderStepId(order: NexoraWorkOrder, taskStepId: string) {
  return order.executionPlan.find((step) => step.taskStepId === taskStepId)?.id || taskStepId;
}

async function runValidation(task: DelegatedTask, workOrder: NexoraWorkOrder, context: RuntimeContext) {
  const latest = await getDelegatedTask(task.id);
  const steps = latest?.executionPlan || [];
  const checks: NexoraWorkOrderValidationCheck[] = [];
  const validationResults: NexoraWorkOrder['evidence']['validationResults'] = [];

  for (const check of workOrder.validationPlan) {
    const next = { ...check };
    try {
      if (check.kind === 'plan_step') {
        const sourceStep = steps.find((step) => step.id === check.sourceStepId) || steps.find((step) => step.targetTool === check.tool);
        const passed = Boolean(sourceStep && sourceStep.status === 'completed');
        next.status = passed ? 'passed' : 'failed';
        next.resultSummary = sourceStep?.resultSummary || (passed ? 'Plan step completed.' : 'Required plan step did not complete.');
      } else if (check.kind === 'artifact_read') {
        const validationResult = await (await loadRegistry()).executeRegisteredTool(check.tool || 'code.read', check.arguments || {}, context);
        const passed = !resultFailed(validationResult);
        next.status = passed ? 'passed' : 'failed';
        next.resultSummary = resultSummary(validationResult);
      } else {
        const incomplete = steps.filter((step) => !['completed', 'skipped'].includes(step.status));
        next.status = incomplete.length ? 'failed' : 'passed';
        next.resultSummary = incomplete.length ? `${incomplete.length} plan step(s) are incomplete.` : 'All required plan steps completed.';
      }
    } catch (error) {
      next.status = 'failed';
      next.resultSummary = error instanceof Error ? error.message : String(error);
    }
    checks.push(next);
    validationResults.push({ checkId: next.id, status: next.status, summary: next.resultSummary || next.description });
  }

  const validationPassed = checks.every((check) => !check.required || check.status === 'passed');
  const acceptanceCriteria = workOrder.acceptanceCriteria.map((criterion) => ({
    ...criterion,
    status: validationPassed ? ('passed' as const) : ('failed' as const),
    evidence: validationResults.map((result) => `${result.checkId}: ${result.summary}`),
  }));
  await patchNexoraWorkOrder(task.id, {
    validationPlan: checks,
    acceptanceCriteria,
    evidence: { validationResults },
  });
  return { validationPassed, checks, acceptanceCriteria, validationResults };
}

export const nexoraWorkOrderExecutionWorker: DelegatedTaskHandler = async (initialTask) => {
  if (initialTask.assignedAgent !== 'nexora') return false;

  let workOrder: NexoraWorkOrder;
  try {
    workOrder = await createNexoraWorkOrderForTask(initialTask);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDelegatedTask(initialTask.id, {
      status: 'failed',
      result: { ok: false, summary: message, error: { message } },
      event: { type: 'task.failed', actor: 'system', summary: message, details: { workOrderValidationFailed: true } },
    });
    return true;
  }

  let task = await ensurePersistedExecutionPlan(initialTask, workOrder);
  workOrder = (await getNexoraWorkOrderByTaskId(task.id)) || workOrder;
  if (workOrder.state === 'ready') await transitionNexoraWorkOrder(task.id, 'queued', { summary: 'Validated work order entered the durable queue.' });
  if (workOrder.state === 'blocked') await transitionNexoraWorkOrder(task.id, 'queued', { summary: 'Previously blocked work order was resumed through the existing authority path.' });
  await transitionNexoraWorkOrder(task.id, 'running', { actor: 'nexora', summary: 'Nexora began executing the bounded work order.' });

  const context = await createRuntimeContext(task, workOrder);
  const toolsUsed: string[] = [];
  const commandsRun: string[] = [];
  const artifactsChanged: string[] = [];
  const stepResults: NexoraWorkOrder['evidence']['stepResults'] = [];
  const errors: string[] = [];

  try {
    for (const step of [...(task.executionPlan || [])].sort((left, right) => left.order - right.order)) {
      if (['completed', 'skipped', 'cancelled'].includes(step.status)) {
        if (step.status === 'completed') {
          toolsUsed.push(step.targetTool);
          artifactsChanged.push(...artifactPathsForStep(step));
          const command = commandValue(stepInput(step));
          if (command) commandsRun.push(command);
          stepResults.push({ stepId: workOrderStepId(workOrder, step.id), tool: step.targetTool, status: 'completed', summary: step.resultSummary || 'Previously completed step preserved during recovery.' });
        }
        continue;
      }

      const outcome = await executeStep(task, workOrder, step, context);
      if (outcome.blocked) {
        await patchNexoraWorkOrder(task.id, {
          evidence: {
            toolsUsed,
            commandsRun,
            artifactsChanged,
            stepResults,
            errors,
            remainingWork: (task.executionPlan || []).filter((candidate) => !['completed', 'skipped'].includes(candidate.status)).map((candidate) => `${candidate.targetTool} (${candidate.id})`),
          },
        });
        return true;
      }

      toolsUsed.push(step.targetTool);
      artifactsChanged.push(...artifactPathsForStep(step));
      const command = commandValue(outcome.input);
      if (command) commandsRun.push(command);
      stepResults.push({
        stepId: workOrderStepId(workOrder, step.id),
        tool: step.targetTool,
        status: 'completed',
        summary: outcome.summary,
        result: redactForLogs(outcome.result),
      });
      await patchNexoraWorkOrder(task.id, { evidence: { toolsUsed, commandsRun, artifactsChanged, stepResults } });
    }

    await transitionNexoraWorkOrder(task.id, 'validating', { actor: 'nexora', summary: 'Execution finished; Nexora began required validation.' });
    workOrder = (await getNexoraWorkOrderByTaskId(task.id)) || workOrder;
    const validation = await runValidation(task, workOrder, context);
    const terminalState = validation.validationPassed ? 'completed' : 'failed';
    await transitionNexoraWorkOrder(task.id, terminalState, {
      actor: 'nexora',
      summary: validation.validationPassed ? 'Nexora completed and validated the bounded work order.' : 'Nexora execution finished, but required validation failed.',
    });
    workOrder = (await getNexoraWorkOrderByTaskId(task.id)) || workOrder;

    const completion = {
      workOrderId: workOrder.id,
      workOrderVersion: workOrder.version,
      terminalStatus: workOrder.state,
      summary: validation.validationPassed
        ? `Nexora executed and validated ${stepResults.length} work-order step${stepResults.length === 1 ? '' : 's'}.`
        : 'Nexora executed the work order, but one or more required validation checks failed.',
      artifactsChanged: unique(artifactsChanged),
      toolsUsed: unique(toolsUsed),
      commandsRun: unique(commandsRun),
      validation: {
        passed: validation.validationPassed,
        checks: validation.checks,
        acceptanceCriteria: validation.acceptanceCriteria,
      },
      errors,
      remainingWork: validation.validationPassed ? [] : validation.validationResults.filter((result) => result.status !== 'passed').map((result) => result.summary),
      receiptIds: [workOrder.receiptId],
      rollbackGuidance: workOrder.rollbackGuidance,
      commandId: workOrder.contextReferences.commandId,
      contextBundleId: workOrder.contextReferences.contextBundleId,
      contextReferences: workOrder.contextReferences,
    };

    await patchNexoraWorkOrder(task.id, {
      evidence: {
        toolsUsed,
        commandsRun,
        artifactsChanged,
        stepResults,
        errors,
        remainingWork: completion.remainingWork,
        receiptIds: [workOrder.receiptId],
      },
    });
    await updateDelegatedTask(task.id, {
      status: validation.validationPassed ? 'completed' : 'failed',
      result: {
        ok: validation.validationPassed,
        summary: completion.summary,
        data: { handledBy: 'nexora.work-order-worker', workOrder: completion, completion },
        ...(!validation.validationPassed ? { error: { message: 'Required Nexora work-order validation failed.' } } : {}),
      },
      event: {
        type: validation.validationPassed ? 'task.completed' : 'task.failed',
        actor: 'nexora',
        summary: completion.summary,
        details: { workOrderId: workOrder.id, receiptId: workOrder.receiptId, validationPassed: validation.validationPassed },
      },
    });

    const completedTask = await getDelegatedTask(task.id);
    const taskReceiptId = completedTask?.receipt?.id;
    if (taskReceiptId) {
      await patchNexoraWorkOrder(task.id, { evidence: { receiptIds: [workOrder.receiptId, taskReceiptId] } });
      const currentResult = completedTask?.result;
      const currentData = isRecord(currentResult?.data) ? { ...currentResult.data } : {};
      const currentCompletion = isRecord(currentData.completion) ? { ...currentData.completion } : completion;
      const currentWorkOrder = isRecord(currentData.workOrder) ? { ...currentData.workOrder } : completion;
      const receiptIds = unique([workOrder.receiptId, taskReceiptId]);
      await updateDelegatedTask(task.id, {
        result: {
          ...(currentResult || { ok: validation.validationPassed, summary: completion.summary }),
          data: {
            ...currentData,
            completion: { ...currentCompletion, receiptIds },
            workOrder: { ...currentWorkOrder, receiptIds },
          },
        },
      });
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    const currentOrder = await getNexoraWorkOrderByTaskId(task.id);
    if (currentOrder && !['completed', 'failed', 'cancelled'].includes(currentOrder.state)) {
      await transitionNexoraWorkOrder(task.id, 'failed', { actor: 'nexora', summary: message });
    }
    await patchNexoraWorkOrder(task.id, {
      evidence: {
        toolsUsed,
        commandsRun,
        artifactsChanged,
        stepResults,
        errors,
        remainingWork: (task.executionPlan || []).filter((candidate) => !['completed', 'skipped'].includes(candidate.status)).map((candidate) => `${candidate.targetTool} (${candidate.id})`),
      },
    });
    await updateDelegatedTask(task.id, {
      status: 'failed',
      result: {
        ok: false,
        summary: message,
        data: {
          handledBy: 'nexora.work-order-worker',
          workOrderId: currentOrder?.id,
          receiptIds: currentOrder ? [currentOrder.receiptId] : [],
          artifactsChanged: unique(artifactsChanged),
          toolsUsed: unique(toolsUsed),
          commandsRun: unique(commandsRun),
          rollbackGuidance: currentOrder?.rollbackGuidance,
        },
        error: { message, ...(error instanceof Error && error.stack ? { stack: error.stack } : {}) },
      },
      event: { type: 'task.failed', actor: 'nexora', summary: message, details: { workOrderId: currentOrder?.id } },
    });
    return true;
  }
};
