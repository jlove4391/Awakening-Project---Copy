import type { RegisteredToolDefinition } from '../tools/registry.js';
import { decidePolicyForToolName, policyBlocksExecution, policyRequiresApproval } from '../governance/policyDecision.js';
import { getRelationshipContext } from '../relationship/relationshipService.js';
import type { RuntimeContext } from '../types.js';
import { evaluateNexoraCapabilityForStep, isAllowedUserRequestedOrDelegatedCoreTool } from '../workflows/nexora/capabilities.js';
import { redactForLogs } from '../workflows/nexora/secretsPolicy.js';
import type { DelegatedTaskHandler } from './queue.js';
import { appendExecutionPlanStep, getDelegatedTask, updateDelegatedTask, updateExecutionPlanStep } from './store.js';
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
const deleteTools = new Set(['code.delete_file', 'code.delete_path']);
const commandTools = new Set(['code.run_command', 'code.test', 'delegation.execute_code']);
const terminalWorkOrderStates = new Set(['completed', 'failed', 'cancelled']);

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
  } catch {
    return 'Result could not be summarized.';
  }
}

function resultFailed(result: unknown) {
  if (!isRecord(result)) return false;
  if (result.ok === false) return true;
  return ['failed', 'error', 'blocked', 'approval_required', 'provider_not_configured'].includes(text(result.status).toLowerCase());
}

function providerConfigurationMessage(message: string) {
  return /not configured|missing credential|oauth|access token|refresh token|api key|client secret|invalid_grant|provider configuration/i.test(message);
}

function pathValues(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const values: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (/^(path|file|filePath|targetPath|destination|to|workingDirectory)$/i.test(key) && typeof entry === 'string' && entry.trim()) {
      values.push(entry.trim().replace(/\\/g, '/'));
    }
  }
  return unique(values);
}

function commandValue(value: unknown) {
  if (!isRecord(value)) return undefined;
  return text(value.command) || text(value.script) || undefined;
}

function pathAllowed(candidate: string, order: NexoraWorkOrder) {
  const normalized = candidate.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return false;
  if (order.scope.deniedPaths.some((denied) => normalized === denied || normalized.startsWith(`${denied}/`))) return false;
  return order.scope.allowedPaths.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\\/g, '/').replace(/^\.\//, '');
    return normalizedAllowed === '.' || normalized === normalizedAllowed || normalized.startsWith(`${normalizedAllowed}/`);
  });
}

function enforceScope(step: ExecutionPlanStep, order: NexoraWorkOrder) {
  if (step.targetTool === 'code.commit' && !order.scope.allowGitCommit) throw new Error('Work order does not authorize a Git commit.');
  if (commandTools.has(step.targetTool) && !order.scope.allowCommands) throw new Error(`Work order does not authorize command execution for ${step.targetTool}.`);
  for (const candidate of pathValues(stepInput(step))) {
    if (!pathAllowed(candidate, order)) throw new Error(`Path ${candidate} is outside the declared work-order scope.`);
  }
}

async function registry() {
  return import('../tools/registry.js');
}

function approvalScope(definition: RegisteredToolDefinition | undefined) {
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

async function runtimeContext(task: DelegatedTask, order: NexoraWorkOrder): Promise<RuntimeContext> {
  const context: RuntimeContext = {
    sessionId: task.sessionId,
    agent: 'nexora',
    channel: 'text',
    executionMode: task.executionOrigin,
    approvedDelegatedTaskId: task.id,
    ...(order.contextReferences.commandId ? { commandId: order.contextReferences.commandId } : {}),
    session: undefined as unknown as RuntimeContext['session'],
    record: { id: task.sessionId, provider: 'local-memory', memories: [], tasks: [], updatedAt: new Date().toISOString() },
  };
  context.relationshipContext = await getRelationshipContext('jordan');
  if (order.contextReferences.contextBundleId) {
    const { getCoreContextBundle } = await import('../core/index.js');
    context.coreContext = await getCoreContextBundle(order.contextReferences.contextBundleId);
  }
  return context;
}

async function ensureTaskPlan(task: DelegatedTask, order: NexoraWorkOrder) {
  if (task.executionPlan?.length) return task;
  const appended: ExecutionPlanStep[] = [];
  for (const workStep of order.executionPlan) {
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
  const executionPlan: NexoraWorkOrderPlanStep[] = order.executionPlan.map((step, index) => ({
    ...step,
    taskStepId: appended[index]?.id || latest.executionPlan?.[index]?.id,
    status: appended[index]?.status || latest.executionPlan?.[index]?.status || step.status,
    approvalStatus: appended[index]?.approvalStatus || latest.executionPlan?.[index]?.approvalStatus || step.approvalStatus,
  }));
  await patchNexoraWorkOrder(task.id, { executionPlan });
  return latest;
}

async function latestTaskAndStep(taskId: string, stepId: string, fallbackTask: DelegatedTask, fallbackStep: ExecutionPlanStep) {
  const task = (await getDelegatedTask(taskId)) || fallbackTask;
  const step = task.executionPlan?.find((candidate) => candidate.id === stepId) || fallbackStep;
  return { task, step };
}

async function blockStep(
  task: DelegatedTask,
  step: ExecutionPlanStep,
  message: string,
  reason: 'step_approval_required' | 'provider_configuration_required' | 'policy_block',
  details: Record<string, unknown> = {},
) {
  const latest = await latestTaskAndStep(task.id, step.id, task, step);
  if (reason === 'step_approval_required' && latest.step.approvalStatus === 'approved') {
    return { blocked: false as const, supersededByApproval: true as const, task: latest.task, step: latest.step };
  }

  const definition = (await registry()).getRegisteredTool(latest.step.targetTool);
  const pendingToolAction = {
    stepId: latest.step.id,
    toolName: latest.step.targetTool,
    riskLevel: definition?.riskLevel,
    action: definition?.audit.action,
    arguments: latest.step.arguments,
    argumentTemplate: latest.step.argumentTemplate,
    approvalStatus: 'pending' as const,
    reason: message,
    approvalScope: approvalScope(definition),
  };
  await updateExecutionPlanStep(latest.task.id, latest.step.id, {
    status: 'blocked',
    approvalStatus: reason === 'step_approval_required' ? 'pending' : latest.step.approvalStatus,
    ...(reason === 'step_approval_required'
      ? { approval: { required: true, status: 'pending' as const, reason: message, scope: approvalScope(definition) } }
      : {}),
    resultSummary: message,
  });
  await transitionNexoraWorkOrder(latest.task.id, 'blocked', {
    actor: 'nexora',
    summary: message,
    details: { stepId: latest.step.id, tool: latest.step.targetTool, reason, ...details },
  });
  await updateDelegatedTask(latest.task.id, {
    status: 'blocked',
    blockedReason: reason,
    pendingToolAction,
    log: message,
    event: {
      type: 'task.blocked',
      actor: 'nexora',
      summary: message,
      details: redactForLogs({ stepId: latest.step.id, tool: latest.step.targetTool, reason, ...details }) as Record<string, unknown>,
    },
  });
  return { blocked: true as const, supersededByApproval: false as const, task: latest.task, step: latest.step };
}

async function executeStep(initialTask: DelegatedTask, order: NexoraWorkOrder, initialStep: ExecutionPlanStep, context: RuntimeContext) {
  let task = initialTask;
  let step = initialStep;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    ({ task, step } = await latestTaskAndStep(task.id, step.id, task, step));
    const input = stepInput(step);
    const authorizedInput = step.approvalStatus === 'approved'
      ? { ...input, confirmedByUser: true, approvalNote: text(step.approval?.note) || 'Approved through the durable delegated-step authority path.' }
      : input;
    enforceScope(step, order);

    const tools = await registry();
    const definition = tools.getRegisteredTool(step.targetTool);
    const decision = decidePolicyForToolName(definition?.name || step.targetTool, authorizedInput);
    const needsApproval = policyRequiresApproval(decision);
    const policyBlocked = policyBlocksExecution(decision);
    let capability = evaluateNexoraCapabilityForStep(step.targetTool, needsApproval ? step.approvalStatus : 'not_required', task.executionOrigin);

    if (!capability.allowed && capability.reason === 'approval_required' && !needsApproval && isAllowedUserRequestedOrDelegatedCoreTool(step.targetTool, task.executionOrigin, definition)) {
      await updateExecutionPlanStep(task.id, step.id, {
        approvalStatus: 'approved',
        approval: {
          required: true,
          status: 'approved',
          approver: 'user_authorized_execution_mode',
          approvedAt: new Date().toISOString(),
          note: 'Authorized by the explicit user-requested or delegated work order.',
          reason: 'user_authorized_delegated_execution',
          scope: approvalScope(definition),
        },
      });
      ({ task, step } = await latestTaskAndStep(task.id, step.id, task, step));
      capability = evaluateNexoraCapabilityForStep(step.targetTool, 'approved', task.executionOrigin);
    }

    if (policyBlocked || (needsApproval && step.approvalStatus !== 'approved')) {
      const decisionName = String(decision.decision);
      const reason = decisionName === 'setup_needed'
        ? 'provider_configuration_required'
        : decisionName === 'escalate'
          ? 'step_approval_required'
          : 'policy_block';
      const block = await blockStep(task, step, decision.reason, reason, { policyDecision: decision });
      if (block.supersededByApproval) {
        task = block.task;
        step = block.step;
        continue;
      }
      return { blocked: true as const };
    }

    if (!capability.allowed) {
      const reason = capability.reason === 'approval_required' ? 'step_approval_required' : 'policy_block';
      const block = await blockStep(task, step, capability.message || `Nexora capability rejected ${step.targetTool}.`, reason, { capabilityDecision: capability });
      if (block.supersededByApproval) {
        task = block.task;
        step = block.step;
        continue;
      }
      return { blocked: true as const };
    }

    if (step.status === 'running' && mutationTools.has(step.targetTool)) {
      await blockStep(task, step, `Interrupted mutating step ${step.id} requires reconciliation before retry; CORE will not repeat a possibly completed write after restart.`, 'policy_block', { interruptedStep: true });
      return { blocked: true as const };
    }
    if (step.status === 'running') {
      await updateExecutionPlanStep(task.id, step.id, { status: 'queued', resultSummary: 'Safe interrupted step reset for restart recovery.' });
    }

    const executableInput = { ...authorizedInput };
    if (needsApproval && step.approvalStatus === 'approved') {
      context.approvedExecutionId = step.id;
      context.approvedDelegatedStepId = step.id;
    } else {
      context.approvedExecutionId = undefined;
      context.approvedDelegatedStepId = undefined;
    }

    await updateExecutionPlanStep(task.id, step.id, { status: 'running' });
    try {
      const result = await tools.executeRegisteredTool(step.targetTool, executableInput, context);
      if (resultFailed(result)) {
        const summary = resultSummary(result);
        if (/approval|required|pending/i.test(summary)) {
          const block = await blockStep(task, step, summary, 'step_approval_required');
          if (block.supersededByApproval) {
            task = block.task;
            step = block.step;
            continue;
          }
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

  await blockStep(task, step, 'The step approval state changed concurrently and could not be reconciled safely.', 'policy_block');
  return { blocked: true as const };
}

function artifactsForStep(step: ExecutionPlanStep) {
  return mutationTools.has(step.targetTool) ? pathValues(stepInput(step)) : [];
}

function workStepId(order: NexoraWorkOrder, taskStepId: string) {
  return order.executionPlan.find((step) => step.taskStepId === taskStepId)?.id || taskStepId;
}

function deletionExpected(task: DelegatedTask, check: NexoraWorkOrderValidationCheck) {
  const checkPath = text(check.arguments?.path);
  return Boolean(checkPath && task.executionPlan?.some((step) => deleteTools.has(step.targetTool) && pathValues(stepInput(step)).includes(checkPath)));
}

async function validate(task: DelegatedTask, order: NexoraWorkOrder, context: RuntimeContext) {
  const latest = await getDelegatedTask(task.id);
  const steps = latest?.executionPlan || [];
  const checks: NexoraWorkOrderValidationCheck[] = [];
  const validationResults: NexoraWorkOrder['evidence']['validationResults'] = [];

  for (const check of order.validationPlan) {
    const next = { ...check };
    try {
      if (check.kind === 'plan_step') {
        const source = steps.find((step) => step.id === check.sourceStepId) || steps.find((step) => step.targetTool === check.tool);
        next.status = source?.status === 'completed' ? 'passed' : 'failed';
        next.resultSummary = source?.resultSummary || 'Required plan step did not complete.';
      } else if (check.kind === 'artifact_read') {
        const expectAbsent = deletionExpected(task, check);
        try {
          const result = await (await registry()).executeRegisteredTool(check.tool || 'code.read', check.arguments || {}, context);
          const failed = resultFailed(result);
          next.status = expectAbsent ? (failed ? 'passed' : 'failed') : (failed ? 'failed' : 'passed');
          next.resultSummary = expectAbsent && failed ? 'Artifact is absent after the approved deletion.' : resultSummary(result);
        } catch (error) {
          next.status = expectAbsent ? 'passed' : 'failed';
          next.resultSummary = expectAbsent ? 'Artifact is absent after the approved deletion.' : error instanceof Error ? error.message : String(error);
        }
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

  const passed = checks.every((check) => !check.required || check.status === 'passed');
  const acceptanceCriteria = order.acceptanceCriteria.map((criterion) => ({
    ...criterion,
    status: passed ? ('passed' as const) : ('failed' as const),
    evidence: validationResults.map((result) => `${result.checkId}: ${result.summary}`),
  }));
  await patchNexoraWorkOrder(task.id, { validationPlan: checks, acceptanceCriteria, evidence: { validationResults } });
  return { passed, checks, acceptanceCriteria, validationResults };
}

export const nexoraWorkOrderExecutionWorker: DelegatedTaskHandler = async (initialTask) => {
  if (initialTask.assignedAgent !== 'nexora') return false;

  let order: NexoraWorkOrder;
  try {
    order = await createNexoraWorkOrderForTask(initialTask);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDelegatedTask(initialTask.id, {
      status: 'failed',
      result: { ok: false, summary: message, error: { message } },
      event: { type: 'task.failed', actor: 'system', summary: message, details: { workOrderValidationFailed: true } },
    });
    return true;
  }

  const task = await ensureTaskPlan(initialTask, order);
  order = (await getNexoraWorkOrderByTaskId(task.id)) || order;
  if (order.state === 'ready') await transitionNexoraWorkOrder(task.id, 'queued', { summary: 'Validated work order entered the durable queue.' });
  if (order.state === 'blocked') await transitionNexoraWorkOrder(task.id, 'queued', { summary: 'Previously blocked work order resumed through the existing authority path.' });
  await transitionNexoraWorkOrder(task.id, 'running', { actor: 'nexora', summary: 'Nexora began executing the bounded work order.' });

  const context = await runtimeContext(task, order);
  const toolsUsed: string[] = [];
  const commandsRun: string[] = [];
  const artifactsChanged: string[] = [];
  const stepResults: NexoraWorkOrder['evidence']['stepResults'] = [];
  const errors: string[] = [];

  try {
    for (const plannedStep of [...(task.executionPlan || [])].sort((left, right) => left.order - right.order)) {
      const latest = await latestTaskAndStep(task.id, plannedStep.id, task, plannedStep);
      const step = latest.step;
      if (['completed', 'skipped', 'cancelled'].includes(step.status)) {
        if (step.status === 'completed') {
          toolsUsed.push(step.targetTool);
          artifactsChanged.push(...artifactsForStep(step));
          const command = commandValue(stepInput(step));
          if (command) commandsRun.push(command);
          stepResults.push({ stepId: workStepId(order, step.id), tool: step.targetTool, status: 'completed', summary: step.resultSummary || 'Previously completed step preserved during recovery.' });
        }
        continue;
      }

      const outcome = await executeStep(latest.task, order, step, context);
      if (outcome.blocked) {
        const current = await getDelegatedTask(task.id);
        await patchNexoraWorkOrder(task.id, {
          evidence: {
            toolsUsed,
            commandsRun,
            artifactsChanged,
            stepResults,
            errors,
            remainingWork: (current?.executionPlan || task.executionPlan || []).filter((candidate) => !['completed', 'skipped'].includes(candidate.status)).map((candidate) => `${candidate.targetTool} (${candidate.id})`),
          },
        });
        return true;
      }
      toolsUsed.push(step.targetTool);
      artifactsChanged.push(...artifactsForStep(step));
      const command = commandValue(outcome.input);
      if (command) commandsRun.push(command);
      stepResults.push({ stepId: workStepId(order, step.id), tool: step.targetTool, status: 'completed', summary: outcome.summary, result: redactForLogs(outcome.result) });
      await patchNexoraWorkOrder(task.id, { evidence: { toolsUsed, commandsRun, artifactsChanged, stepResults } });
    }

    await transitionNexoraWorkOrder(task.id, 'validating', { actor: 'nexora', summary: 'Execution finished; Nexora began required validation.' });
    order = (await getNexoraWorkOrderByTaskId(task.id)) || order;
    const validation = await validate(task, order, context);
    await transitionNexoraWorkOrder(task.id, validation.passed ? 'completed' : 'failed', {
      actor: 'nexora',
      summary: validation.passed ? 'Nexora completed and validated the bounded work order.' : 'Nexora execution finished, but required validation failed.',
    });
    order = (await getNexoraWorkOrderByTaskId(task.id)) || order;

    const completion = {
      workOrderId: order.id,
      workOrderVersion: order.version,
      terminalStatus: order.state,
      summary: validation.passed ? `Nexora executed and validated ${stepResults.length} work-order step${stepResults.length === 1 ? '' : 's'}.` : 'Required Nexora work-order validation failed.',
      artifactsChanged: unique(artifactsChanged),
      toolsUsed: unique(toolsUsed),
      commandsRun: unique(commandsRun),
      validation: { passed: validation.passed, checks: validation.checks, acceptanceCriteria: validation.acceptanceCriteria },
      errors,
      remainingWork: validation.passed ? [] : validation.validationResults.filter((result) => result.status !== 'passed').map((result) => result.summary),
      receiptIds: [order.receiptId],
      rollbackGuidance: order.rollbackGuidance,
      commandId: order.contextReferences.commandId,
      contextBundleId: order.contextReferences.contextBundleId,
      contextReferences: order.contextReferences,
    };

    await patchNexoraWorkOrder(task.id, {
      evidence: {
        toolsUsed,
        commandsRun,
        artifactsChanged,
        stepResults,
        errors,
        remainingWork: completion.remainingWork,
        receiptIds: [order.receiptId],
      },
    });
    await updateDelegatedTask(task.id, {
      status: validation.passed ? 'completed' : 'failed',
      result: {
        ok: validation.passed,
        summary: completion.summary,
        data: { handledBy: 'nexora.work-order-worker', workOrder: completion, completion },
        ...(!validation.passed ? { error: { message: 'Required Nexora work-order validation failed.' } } : {}),
      },
      event: {
        type: validation.passed ? 'task.completed' : 'task.failed',
        actor: 'nexora',
        summary: completion.summary,
        details: { workOrderId: order.id, receiptId: order.receiptId, validationPassed: validation.passed },
      },
    });

    const completedTask = await getDelegatedTask(task.id);
    const taskReceiptId = completedTask?.receipt?.id;
    if (taskReceiptId) {
      const receiptIds = unique([order.receiptId, taskReceiptId]);
      await patchNexoraWorkOrder(task.id, { evidence: { receiptIds } });
      const currentResult = completedTask?.result;
      const currentData = isRecord(currentResult?.data) ? { ...currentResult.data } : {};
      const currentCompletion = isRecord(currentData.completion) ? { ...currentData.completion } : completion;
      const currentWorkOrder = isRecord(currentData.workOrder) ? { ...currentData.workOrder } : completion;
      await updateDelegatedTask(task.id, {
        result: {
          ...(currentResult || { ok: validation.passed, summary: completion.summary }),
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
    if (currentOrder && !terminalWorkOrderStates.has(currentOrder.state)) {
      await transitionNexoraWorkOrder(task.id, 'failed', { actor: 'nexora', summary: message });
    }
    const currentTask = await getDelegatedTask(task.id);
    await patchNexoraWorkOrder(task.id, {
      evidence: {
        toolsUsed,
        commandsRun,
        artifactsChanged,
        stepResults,
        errors,
        remainingWork: (currentTask?.executionPlan || task.executionPlan || []).filter((candidate) => !['completed', 'skipped'].includes(candidate.status)).map((candidate) => `${candidate.targetTool} (${candidate.id})`),
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
