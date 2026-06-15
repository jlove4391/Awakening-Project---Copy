import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { attachNexoraCompletion } from '../workflows/nexora/completion.js';
import { taskEvents } from './events.js';
import type {
  AppendExecutionPlanStepInput,
  ApprovalRequirement,
  CreateDelegatedTaskInput,
  DelegatedTask,
  DelegatedTaskEvent,
  DelegatedTaskEventType,
  DelegatedTaskResult,
  DelegatedTaskStatus,
  DelegatedTaskUiState,
  TaskAuditEntry,
  TaskReceipt,
  UpdateExecutionPlanStepInput,
  UpdateDelegatedTaskInput,
} from './types.js';

const taskDir = path.join(runtimeConfig.dataDir, 'tasks');
const tasksPath = path.join(taskDir, 'delegated-tasks.json');
const auditPath = path.join(taskDir, 'delegated-task-audit.jsonl');

const terminalStatuses = new Set<DelegatedTaskStatus>(['completed', 'failed', 'cancelled']);
let cache: DelegatedTask[] | undefined;
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(taskDir, { recursive: true });
}

async function loadTasks() {
  if (cache) return cache;
  await ensureStore();
  try {
    cache = JSON.parse(await fs.readFile(tasksPath, 'utf8')) as DelegatedTask[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cache = [];
    await persistTasks();
  }
  return cache;
}

async function persistTasks() {
  await ensureStore();
  await fs.writeFile(tasksPath, `${JSON.stringify(cache || [], null, 2)}\n`);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

function normalizeApprovalRequirements(input?: Array<Partial<ApprovalRequirement> | string>): ApprovalRequirement[] {
  return (input || []).map((item) => {
    const base = typeof item === 'string' ? { reason: item } : item;
    const required = base.required ?? true;
    return {
      required,
      status: required ? base.status || 'pending' : 'not_required',
      approver: base.approver,
      approvedAt: base.approvedAt,
      rejectedAt: base.rejectedAt,
      note: base.note,
      reason: base.reason,
    } satisfies ApprovalRequirement;
  });
}

function normalizeExecutionPlanStep(input: AppendExecutionPlanStepInput, order: number) {
  const timestamp = now();
  const requestedApprovalStatus = input.approval?.status || input.approvalStatus || 'not_required';
  const approvalRequired = input.approval?.required ?? requestedApprovalStatus === 'pending';
  const approvalStatus = approvalRequired && requestedApprovalStatus === 'not_required' ? 'pending' : requestedApprovalStatus;
  return {
    id: input.id || randomUUID(),
    order: input.order ?? order,
    targetTool: input.targetTool,
    ...(input.arguments !== undefined ? { arguments: input.arguments } : {}),
    ...(input.argumentTemplate !== undefined ? { argumentTemplate: input.argumentTemplate } : {}),
    approvalStatus,
    approval: {
      required: approvalRequired,
      status: approvalStatus,
      approver: input.approval?.approver,
      approvedAt: input.approval?.approvedAt,
      rejectedAt: input.approval?.rejectedAt,
      note: input.approval?.note,
      reason: input.approval?.reason,
    },
    status: input.status || 'queued',
    ...(input.resultSummary !== undefined ? { resultSummary: input.resultSummary } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sortExecutionPlan(task: DelegatedTask) {
  task.executionPlan?.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

function needsApproval(requirements: ApprovalRequirement[]) {
  return requirements.some((requirement) => requirement.required && requirement.status === 'pending');
}

function hasPendingExecutionPlanApproval(task: DelegatedTask) {
  return Boolean(task.executionPlan?.some((step) => step.approval?.required && step.approvalStatus === 'pending'));
}


function taskApprovalStatus(task: DelegatedTask) {
  const requirementStatuses = task.approvalRequirements.filter((requirement) => requirement.required).map((requirement) => requirement.status);
  const stepStatuses = (task.executionPlan || [])
    .filter((step) => step.approval?.required || step.approvalStatus !== 'not_required')
    .map((step) => step.approvalStatus);
  const statuses = [...requirementStatuses, ...stepStatuses];
  if (!statuses.length) return 'not_required' as const;
  if (statuses.includes('rejected')) return 'rejected' as const;
  if (statuses.includes('pending')) return 'pending' as const;
  return 'approved' as const;
}

function currentWorkerStep(task: DelegatedTask) {
  if (!task.executionPlan?.length) return undefined;
  const pendingActionStep = task.pendingToolAction?.stepId
    ? task.executionPlan.find((step) => step.id === task.pendingToolAction?.stepId)
    : undefined;
  return (
    task.executionPlan.find((step) => step.status === 'running') ||
    pendingActionStep ||
    task.executionPlan.find((step) => step.status === 'blocked') ||
    task.executionPlan.find((step) => step.status === 'queued')
  );
}

function missingApproval(task: DelegatedTask) {
  if (task.pendingToolAction?.approvalStatus === 'pending') return task.pendingToolAction;
  return (
    task.approvalRequirements.find((requirement) => requirement.required && requirement.status === 'pending') ||
    task.executionPlan?.find((step) => step.approval?.required && step.approvalStatus === 'pending')?.approval
  );
}

function taskCompletionReport(task: DelegatedTask) {
  const data = task.result?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  return (data as Record<string, unknown>).completion;
}

function missingConfiguration(task: DelegatedTask) {
  if (task.blockedReason !== 'provider_configuration_required') return undefined;
  const details = [...task.events].reverse().find((event) => event.details?.blockedReason === 'provider_configuration_required')?.details || {};
  return {
    blockedReason: 'provider_configuration_required' as const,
    ...(typeof details.provider === 'string' ? { provider: details.provider } : {}),
    ...(typeof details.providerName === 'string' ? { providerName: details.providerName } : {}),
    ...(typeof details.missingConfigHint === 'string' ? { missingConfigHint: details.missingConfigHint } : {}),
    ...(typeof details.nextManualAction === 'string' ? { nextManualAction: details.nextManualAction } : {}),
    ...(typeof details.message === 'string' ? { message: details.message } : {}),
  };
}

export function getDelegatedTaskUiState(task: DelegatedTask, queuedTaskIds: string[] = []): DelegatedTaskUiState {
  const queueStatus = task.status === 'running' ? 'active' : queuedTaskIds.includes(task.id) || task.status === 'queued' ? 'queued' : 'not_queued';
  return {
    taskId: task.id,
    status: task.status,
    approvalStatus: taskApprovalStatus(task),
    queueStatus,
    ...(currentWorkerStep(task) ? { currentWorkerStep: currentWorkerStep(task) } : {}),
    ...(task.blockedReason ? { blockedReason: task.blockedReason } : {}),
    ...(missingApproval(task) ? { missingApproval: missingApproval(task) } : {}),
    ...(missingConfiguration(task) ? { missingConfiguration: missingConfiguration(task) } : {}),
    ...(task.result ? { executionResult: task.result } : {}),
    ...(taskCompletionReport(task) ? { completionReport: taskCompletionReport(task) } : {}),
    ...(task.receipt?.id ? { receiptId: task.receipt.id } : {}),
  };
}

function createAuditEntry(
  taskId: string,
  eventType: DelegatedTaskEventType,
  actor: TaskAuditEntry['actor'],
  summary: string,
  details?: Record<string, unknown>,
): DelegatedTaskEvent {
  return {
    id: randomUUID(),
    taskId,
    eventType,
    actor,
    occurredAt: now(),
    summary,
    ...(details ? { details } : {}),
  };
}

async function appendAuditJsonl(entry: TaskAuditEntry) {
  await ensureStore();
  await fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`);
}

function createReceipt(task: DelegatedTask): TaskReceipt {
  return {
    id: randomUUID(),
    taskId: task.id,
    parentAgent: task.parentAgent,
    assignedAgent: task.assignedAgent,
    status: task.status,
    createdAt: task.createdAt,
    finishedAt: task.finishedAt,
    summary: `Delegated task ${task.id} finished with status ${task.status}: ${task.objective}`,
    proof: {
      auditTrail: task.auditTrail,
      ...(task.result ? { result: task.result } : {}),
      ...(task.result?.error ? { error: task.result.error } : {}),
    },
  };
}

function applyStatusTimestamps(task: DelegatedTask, status: DelegatedTaskStatus) {
  task.status = status;
  if (status === 'running' && !task.startedAt) task.startedAt = now();
  if (terminalStatuses.has(status) && !task.finishedAt) task.finishedAt = now();
}

export async function createDelegatedTask(input: CreateDelegatedTaskInput) {
  return serializedWrite(async () => {
    const tasks = await loadTasks();
    const approvalRequirements = normalizeApprovalRequirements(input.approvalRequirements);
    const status: DelegatedTaskStatus = needsApproval(approvalRequirements) ? 'pending_approval' : 'queued';
    const task: DelegatedTask = {
      id: randomUUID(),
      sessionId: input.sessionId,
      parentAgent: 'elora',
      assignedAgent: 'nexora',
      objective: input.objective,
      constraints: input.constraints || [],
      requiredTools: input.requiredTools || [],
      approvalRequirements,
      ...(input.executionPlan?.length
        ? { executionPlan: input.executionPlan.map((step, index) => normalizeExecutionPlanStep(step, index + 1)) }
        : {}),
      status,
      logs: input.initialLog ? [input.initialLog] : [],
      events: [],
      auditTrail: [],
      createdAt: now(),
      updatedAt: now(),
    };

    const created = createAuditEntry(task.id, 'task.created', 'elora', `Elora delegated task to Nexora: ${task.objective}`, {
      sessionId: task.sessionId,
      parentAgent: task.parentAgent,
      assignedAgent: task.assignedAgent,
      requiredTools: task.requiredTools,
    });
    task.events.push(created);
    task.auditTrail.push(created);
    if (status === 'pending_approval') {
      const approval = createAuditEntry(task.id, 'task.approval_requested', 'system', 'Task is waiting for required approval before queueing.', {
        approvalRequirements,
      });
      task.events.push(approval);
      task.auditTrail.push(approval);
    } else {
      const queued = createAuditEntry(task.id, 'task.queued', 'system', 'Task was added to the durable Nexora queue.');
      task.events.push(queued);
      task.auditTrail.push(queued);
    }

    tasks.unshift(task);
    await persistTasks();
    await Promise.all(task.auditTrail.map(appendAuditJsonl));
    taskEvents.emitTaskCreated(task, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function listDelegatedTasks(sessionId?: string) {
  const tasks = await loadTasks();
  return sessionId ? tasks.filter((task) => task.sessionId === sessionId) : tasks;
}

export async function getDelegatedTask(taskId: string) {
  const tasks = await loadTasks();
  return tasks.find((task) => task.id === taskId);
}

export async function appendDelegatedTaskEvent(
  taskId: string,
  eventType: DelegatedTaskEventType,
  summary: string,
  options: { actor?: TaskAuditEntry['actor']; details?: Record<string, unknown>; log?: boolean } = {},
) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    const event = createAuditEntry(task.id, eventType, options.actor || 'system', summary, options.details);
    task.events.push(event);
    task.auditTrail.push(event);
    if (options.log) task.logs.push(summary);
    task.updatedAt = now();
    await persistTasks();
    await appendAuditJsonl(event);
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function appendExecutionPlanStep(taskId: string, input: AppendExecutionPlanStepInput) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    task.executionPlan ||= [];
    const nextOrder = task.executionPlan.length ? Math.max(...task.executionPlan.map((step) => step.order)) + 1 : 1;
    const step = normalizeExecutionPlanStep(input, nextOrder);
    task.executionPlan.push(step);
    sortExecutionPlan(task);

    const event = createAuditEntry(
      task.id,
      'task.log',
      'system',
      `Execution plan step ${step.id} appended for ${step.targetTool}.`,
      {
        executionPlanStep: step,
      },
    );
    task.events.push(event);
    task.auditTrail.push(event);
    task.updatedAt = now();
    await persistTasks();
    await appendAuditJsonl(event);
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function updateExecutionPlanStep(taskId: string, stepId: string, input: UpdateExecutionPlanStepInput) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    const step = task?.executionPlan?.find((candidate) => candidate.id === stepId);
    if (!task || !step) return undefined;

    if (input.order !== undefined) step.order = input.order;
    if (input.targetTool !== undefined) step.targetTool = input.targetTool;
    if (input.arguments !== undefined) step.arguments = input.arguments;
    if (input.argumentTemplate !== undefined) step.argumentTemplate = input.argumentTemplate;
    if (input.approvalStatus !== undefined) {
      step.approvalStatus = input.approvalStatus;
      if (step.approval) step.approval.status = input.approvalStatus;
    }
    if (input.approval !== undefined) {
      const status = input.approval.status || step.approvalStatus;
      step.approval = {
        required: input.approval.required ?? step.approval?.required ?? status === 'pending',
        status,
        approver: input.approval.approver ?? step.approval?.approver,
        approvedAt: input.approval.approvedAt ?? step.approval?.approvedAt,
        rejectedAt: input.approval.rejectedAt ?? step.approval?.rejectedAt,
        note: input.approval.note ?? step.approval?.note,
        reason: input.approval.reason ?? step.approval?.reason,
      };
      step.approvalStatus = status;
    }
    if (input.status !== undefined) step.status = input.status;
    if (input.resultSummary !== undefined) step.resultSummary = input.resultSummary;
    step.updatedAt = now();
    sortExecutionPlan(task);

    const event = createAuditEntry(task.id, 'task.log', 'system', `Execution plan step ${step.id} updated.`, {
      executionPlanStep: step,
    });
    task.events.push(event);
    task.auditTrail.push(event);
    task.updatedAt = now();
    await persistTasks();
    await appendAuditJsonl(event);
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function updateDelegatedTask(taskId: string, input: UpdateDelegatedTaskInput) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    let event: DelegatedTaskEvent | undefined;
    const newEvents: DelegatedTaskEvent[] = [];

    if (input.status) {
      applyStatusTimestamps(task, input.status);
      if (input.status !== 'blocked') {
        task.blockedReason = undefined;
        task.pendingToolAction = undefined;
      }
      const eventType = statusToEventType(input.status);
      event = createAuditEntry(task.id, eventType, input.event?.actor || 'system', `Task status changed to ${input.status}.`);
      task.events.push(event);
      task.auditTrail.push(event);
      newEvents.push(event);
    }

    if (input.log) {
      task.logs.push(input.log);
      const logEvent = createAuditEntry(task.id, 'task.log', input.event?.actor || 'system', input.log);
      task.events.push(logEvent);
      task.auditTrail.push(logEvent);
      newEvents.push(logEvent);
      event = logEvent;
    }

    if (input.blockedReason !== undefined) task.blockedReason = input.blockedReason;
    if (input.pendingToolAction !== undefined) task.pendingToolAction = input.pendingToolAction;

    if (input.result) {
      task.result = input.result;
      const resultEvent = createAuditEntry(task.id, 'task.result_recorded', input.event?.actor || 'nexora', input.result.summary, {
        ok: input.result.ok,
        data: input.result.data,
        error: input.result.error,
      });
      task.events.push(resultEvent);
      task.auditTrail.push(resultEvent);
      newEvents.push(resultEvent);
      event = resultEvent;
    }

    if (input.event) {
      const customEvent = createAuditEntry(
        task.id,
        input.event.type || 'task.log',
        input.event.actor || 'system',
        input.event.summary,
        input.event.details,
      );
      task.events.push(customEvent);
      task.auditTrail.push(customEvent);
      newEvents.push(customEvent);
      event = customEvent;
    }

    if (terminalStatuses.has(task.status) && !task.receipt) {
      task.receipt = createReceipt(task);
      if (task.status === 'completed' && task.assignedAgent === 'nexora' && task.result) {
        task.result = attachNexoraCompletion(task, task.result);
        task.receipt.proof.result = task.result;
      }
      const receiptEvent = createAuditEntry(task.id, 'task.receipt_created', 'system', `Receipt ${task.receipt.id} created for task ${task.id}.`, {
        receiptId: task.receipt.id,
      });
      task.events.push(receiptEvent);
      task.auditTrail.push(receiptEvent);
      newEvents.push(receiptEvent);
      event = receiptEvent;
    }

    task.updatedAt = now();
    await persistTasks();
    await Promise.all(newEvents.map(appendAuditJsonl));
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    if (terminalStatuses.has(task.status)) taskEvents.emitTaskFinished(task, getDelegatedTaskUiState(task));
    return task;
  });
}

function statusToEventType(status: DelegatedTaskStatus): DelegatedTaskEventType {
  switch (status) {
    case 'pending_approval':
      return 'task.approval_requested';
    case 'running':
      return 'task.started';
    case 'blocked':
      return 'task.blocked';
    case 'completed':
      return 'task.completed';
    case 'failed':
      return 'task.failed';
    case 'cancelled':
      return 'task.cancelled';
    case 'queued':
    default:
      return 'task.queued';
  }
}

export async function approveDelegatedTask(taskId: string, approver = 'user', note = '') {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    const approvedAt = now();
    task.approvalRequirements = task.approvalRequirements.map((requirement) =>
      requirement.required && requirement.status === 'pending'
        ? { ...requirement, status: 'approved', approver, approvedAt, note: note || requirement.note }
        : requirement,
    );
    const status: DelegatedTaskStatus = needsApproval(task.approvalRequirements) ? 'pending_approval' : 'queued';
    applyStatusTimestamps(task, status);
    const event = createAuditEntry(task.id, 'task.approved', 'user', `Approval recorded by ${approver}.`, { note });
    task.events.push(event);
    task.auditTrail.push(event);
    if (status === 'queued') {
      const queued = createAuditEntry(task.id, 'task.queued', 'system', 'All approvals satisfied; task entered the durable Nexora queue.');
      task.events.push(queued);
      task.auditTrail.push(queued);
    }
    task.updatedAt = now();
    await persistTasks();
    await Promise.all(task.auditTrail.slice(-2).map(appendAuditJsonl));
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}


export async function resumeDelegatedTask(taskId: string, actor: TaskAuditEntry['actor'] = 'system', note = '') {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    const pendingApproval = needsApproval(task.approvalRequirements) || hasPendingExecutionPlanApproval(task);
    if (terminalStatuses.has(task.status) || pendingApproval) {
      const reason = pendingApproval ? 'pending_approval' : task.status;
      const event = createAuditEntry(task.id, 'task.log', actor, `Task ${task.id} cannot be resumed because it is ${reason}.`, { status: task.status, reason, note });
      task.events.push(event);
      task.auditTrail.push(event);
      task.updatedAt = now();
      await persistTasks();
      await appendAuditJsonl(event);
      taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
      return task;
    }

    const previousStatus = task.status;
    applyStatusTimestamps(task, 'queued');
    task.blockedReason = undefined;
    task.pendingToolAction = undefined;

    const event = createAuditEntry(task.id, 'task.resumed', actor, 'Task resumed and re-entered the durable Nexora queue.', {
      previousStatus,
      note,
      executionPlanState: task.executionPlan?.map((step) => ({
        id: step.id,
        order: step.order,
        targetTool: step.targetTool,
        status: step.status,
        approvalStatus: step.approvalStatus,
      })),
    });
    task.events.push(event);
    task.auditTrail.push(event);
    task.updatedAt = now();
    await persistTasks();
    await appendAuditJsonl(event);
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function completeDelegatedTask(taskId: string, result: DelegatedTaskResult) {
  return updateDelegatedTask(taskId, { status: result.ok ? 'completed' : 'failed', result });
}

export async function approveExecutionPlanStep(taskId: string, stepId: string, approver = 'user', note = '') {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    const step = task?.executionPlan?.find((candidate) => candidate.id === stepId);
    if (!task || !step) return undefined;
    const approvedAt = now();
    step.approvalStatus = 'approved';
    step.approval = { ...(step.approval || { required: true, status: 'approved' as const }), status: 'approved', approver, approvedAt, note: note || step.approval?.note };
    step.status = 'queued';
    step.updatedAt = approvedAt;
    task.blockedReason = undefined;
    task.pendingToolAction = undefined;
    applyStatusTimestamps(task, 'queued');
    const event = createAuditEntry(task.id, 'task.approved', 'user', `Step ${step.id} approval recorded by ${approver}.`, { stepId, pendingToolAction: { toolName: step.targetTool, arguments: step.arguments, argumentTemplate: step.argumentTemplate }, note });
    const queued = createAuditEntry(task.id, 'task.queued', 'system', 'Approved blocked step; task re-entered the durable Nexora queue.', { stepId });
    task.events.push(event, queued);
    task.auditTrail.push(event, queued);
    task.updatedAt = now();
    await persistTasks();
    await Promise.all([event, queued].map(appendAuditJsonl));
    taskEvents.emitTaskUpdated(task, queued, getDelegatedTaskUiState(task));
    return task;
  });
}
