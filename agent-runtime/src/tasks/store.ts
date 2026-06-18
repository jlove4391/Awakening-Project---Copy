import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { isAllowedUserRequestedOrDelegatedCoreTool } from '../workflows/nexora/capabilities.js';
import { attachNexoraCompletion } from '../workflows/nexora/completion.js';
import { taskEvents } from './events.js';
import type {
  AppendExecutionPlanStepInput,
  ApprovalRequirement,
  AutonomousImprovementProposal,
  CreateDelegatedTaskInput,
  DelegatedTaskAuthorizationSource,
  DelegatedTask,
  DelegatedTaskEvent,
  DelegatedTaskEventType,
  DelegatedTaskResult,
  DelegatedTaskStatus,
  DelegatedTaskUiState,
  ExecutionOrigin,
  TaskAuditEntry,
  TaskReceipt,
  UpdateExecutionPlanStepInput,
  UpdateDelegatedTaskInput,
} from './types.js';

const taskDir = path.join(runtimeConfig.dataDir, 'tasks');
const tasksPath = path.join(taskDir, 'delegated-tasks.json');
const auditPath = path.join(taskDir, 'delegated-task-audit.jsonl');
const taskLogDir = path.join(taskDir, 'logs');
const maxInlineLogBytes = 4_096;
const maxInlineLogs = 100;
const maxInlineCommandOutputBytes = 8_192;

const terminalStatuses = new Set<DelegatedTaskStatus>(['completed', 'failed', 'cancelled']);
let cache: DelegatedTask[] | undefined;
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(taskDir, { recursive: true });
  await fs.mkdir(taskLogDir, { recursive: true });
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


function byteLength(value: string) {
  return Buffer.byteLength(value, 'utf8');
}

function truncateUtf8(value: string, maxBytes: number) {
  if (byteLength(value) <= maxBytes) return { text: value, truncated: false };
  const buffer = Buffer.from(value, 'utf8');
  return { text: buffer.subarray(0, maxBytes).toString('utf8'), truncated: true };
}

function summarizeLogLine(value: string) {
  const summary = truncateUtf8(value, maxInlineLogBytes);
  return summary.truncated ? `${summary.text}\n… [truncated; ${byteLength(value)} bytes total]` : summary.text;
}

async function writeTaskLogReference(taskId: string, label: string, content: string) {
  await ensureStore();
  const safeLabel = label.replace(/[^a-z0-9_.-]/gi, '-').slice(0, 48) || 'log';
  const digest = createHash('sha256').update(content).digest('hex');
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeLabel}-${digest.slice(0, 12)}.log`;
  const relativePath = path.join('tasks', 'logs', taskId, fileName);
  const absoluteDir = path.join(taskLogDir, taskId);
  await fs.mkdir(absoluteDir, { recursive: true });
  await fs.writeFile(path.join(absoluteDir, fileName), content);
  return { path: relativePath, byteLength: byteLength(content), sha256: digest };
}

async function commandOutputSummary(taskId: string, chunk: { stream?: 'stdout' | 'stderr' | 'combined'; text: string; command?: string; stepId?: string; fullLogPath?: string }) {
  const original = String(chunk.text || '');
  const preview = truncateUtf8(original, maxInlineCommandOutputBytes);
  return {
    stream: chunk.stream || 'combined',
    textPreview: preview.text,
    byteLength: byteLength(original),
    truncated: preview.truncated,
    ...(preview.truncated || chunk.fullLogPath
      ? { fullLog: chunk.fullLogPath ? { path: chunk.fullLogPath, byteLength: byteLength(original) } : await writeTaskLogReference(taskId, `${chunk.stream || 'combined'}-chunk`, original) }
      : {}),
  };
}

async function sanitizeDetails(taskId: string, eventType: DelegatedTaskEventType, details?: Record<string, unknown>) {
  if (!details) return undefined;
  const next: Record<string, unknown> = { ...details };
  for (const key of ['stdout', 'stderr', 'output', 'rawOutput', 'logs']) {
    const value = next[key];
    if (typeof value === 'string' && byteLength(value) > maxInlineCommandOutputBytes) {
      next[`${key}Summary`] = await commandOutputSummary(taskId, key === 'stderr' ? { stream: 'stderr', text: value } : { stream: key === 'stdout' ? 'stdout' : 'combined', text: value });
      delete next[key];
    } else if (Array.isArray(value) && JSON.stringify(value).length > maxInlineCommandOutputBytes) {
      const raw = JSON.stringify(value, null, 2);
      next[`${key}Summary`] = await commandOutputSummary(taskId, { stream: 'combined', text: raw });
      delete next[key];
    }
  }
  if (eventType === 'task.command_output_chunk' && typeof next.text === 'string') {
    next.commandOutput = await commandOutputSummary(taskId, { stream: next.stream as 'stdout' | 'stderr' | 'combined' | undefined, text: next.text, fullLogPath: typeof next.fullLogPath === 'string' ? next.fullLogPath : undefined });
    delete next.text;
  }
  return next;
}

async function sanitizeResult(taskId: string, result: DelegatedTaskResult): Promise<DelegatedTaskResult> {
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return result;
  const data = { ...(result.data as Record<string, unknown>) };
  for (const stream of ['stdout', 'stderr'] as const) {
    if (typeof data[stream] === 'string') {
      data[`${stream}Summary`] = await commandOutputSummary(taskId, { stream, text: data[stream] });
      delete data[stream];
    }
  }
  if (Array.isArray(data.logs)) {
    const raw = JSON.stringify(data.logs, null, 2);
    data.logSummary = await commandOutputSummary(taskId, { stream: 'combined', text: raw });
    delete data.logs;
  }
  return { ...result, data };
}

function appendBoundedTaskLog(task: DelegatedTask, log: string) {
  task.logs.push(summarizeLogLine(log));
  if (task.logs.length > maxInlineLogs) task.logs.splice(0, task.logs.length - maxInlineLogs);
}

function authorizedByUser(source: DelegatedTaskAuthorizationSource | undefined) {
  return source === 'user_requested' || source === 'user_delegated';
}

function originForAuthorizationSource(source: DelegatedTaskAuthorizationSource): ExecutionOrigin {
  if (source === 'user_requested') return 'reactive';
  if (source === 'user_delegated') return 'delegated';
  return 'autonomous';
}

function normalizeExecutionOrigin(input: ExecutionOrigin | undefined, authorizationSource: DelegatedTaskAuthorizationSource): ExecutionOrigin {
  return input || originForAuthorizationSource(authorizationSource);
}

function approvalBypassedReason(source: DelegatedTaskAuthorizationSource) {
  return source === 'user_requested'
    ? 'Direct user request authorizes this delegated task without an additional approval prompt.'
    : 'Explicit user delegation chain authorizes this delegated task without an additional approval prompt.';
}

function isHighRiskApprovalScope(scope: ApprovalRequirement['scope'] | undefined) {
  return scope === 'repo.commit'
    || scope === 'repo.delete'
    || scope === 'provider.create'
    || scope === 'provider.update'
    || scope === 'provider.delete'
    || scope === 'database.migrate'
    || scope === 'external.send';
}

function normalizeApprovalRequirements(
  input?: Array<Partial<ApprovalRequirement> | string>,
  authorizationSource: DelegatedTaskAuthorizationSource = 'autonomous',
  executionOrigin?: ExecutionOrigin,
): ApprovalRequirement[] {
  const userAuthorized = authorizedByUser(authorizationSource) && executionOrigin !== 'autonomous';
  return (input || []).map((item) => {
    const base = typeof item === 'string' ? { reason: item } : item;
    const required = base.required ?? true;
    const highRisk = isHighRiskApprovalScope(base.scope);
    const autoApproved = required && userAuthorized && !highRisk;
    const status = required ? (autoApproved ? 'approved' : base.status || 'pending') : 'not_required';
    return {
      required,
      status,
      approver: base.approver,
      approvedAt: base.approvedAt || (autoApproved ? now() : undefined),
      rejectedAt: base.rejectedAt,
      note: base.note || (autoApproved ? approvalBypassedReason(authorizationSource) : undefined),
      reason: base.reason,
      scope: base.scope,
      authorizationSource,
      executionOrigin,
    } satisfies ApprovalRequirement;
  });
}

function normalizeExecutionPlanStep(
  input: AppendExecutionPlanStepInput,
  order: number,
  authorizationSource: DelegatedTaskAuthorizationSource = 'autonomous',
  originContext?: { executionOrigin: ExecutionOrigin; rootTaskId?: string; parentTaskId?: string; delegationChain?: string[] },
) {
  const timestamp = now();
  const executionOrigin = input.executionOrigin || originContext?.executionOrigin || originForAuthorizationSource(authorizationSource);
  const userAuthorized = authorizedByUser(authorizationSource)
    && executionOrigin !== 'autonomous'
    && !isHighRiskApprovalScope(input.approval?.scope)
    && isAllowedUserRequestedOrDelegatedCoreTool(input.targetTool, executionOrigin);
  const requestedApprovalStatus = input.approval?.status || input.approvalStatus || 'not_required';
  const approvalRequired = input.approval?.required ?? requestedApprovalStatus === 'pending';
  const approvalStatus = userAuthorized && approvalRequired ? 'approved' : (approvalRequired && requestedApprovalStatus === 'not_required' ? 'pending' : requestedApprovalStatus);
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
      approvedAt: input.approval?.approvedAt || (approvalRequired && userAuthorized ? timestamp : undefined),
      rejectedAt: input.approval?.rejectedAt,
      note: input.approval?.note || (approvalRequired && userAuthorized ? approvalBypassedReason(authorizationSource) : undefined),
      reason: input.approval?.reason,
      authorizationSource,
      scope: input.approval?.scope,
    },
    status: input.status || 'queued',
    executionOrigin,
    ...(input.parentTaskId || originContext?.parentTaskId ? { parentTaskId: input.parentTaskId || originContext?.parentTaskId } : {}),
    ...(input.rootTaskId || originContext?.rootTaskId ? { rootTaskId: input.rootTaskId || originContext?.rootTaskId } : {}),
    delegationChain: originContext?.delegationChain || [],
    ...(input.resultSummary !== undefined ? { resultSummary: input.resultSummary } : {}),
    ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
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

function hasPendingTaskApprovalGate(task: DelegatedTask) {
  return needsApproval(task.approvalRequirements) || hasPendingExecutionPlanApproval(task);
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
  originContext?: { executionOrigin?: ExecutionOrigin; rootTaskId?: string; parentTaskId?: string },
): DelegatedTaskEvent {
  return {
    id: randomUUID(),
    taskId,
    eventType,
    actor,
    occurredAt: now(),
    summary,
    ...(details ? { details } : {}),
    ...(originContext?.executionOrigin ? { executionOrigin: originContext.executionOrigin } : {}),
    ...(originContext?.rootTaskId ? { rootTaskId: originContext.rootTaskId } : {}),
    ...(originContext?.parentTaskId ? { parentTaskId: originContext.parentTaskId } : {}),
  };
}

async function appendAuditJsonl(entry: TaskAuditEntry) {
  await ensureStore();
  await fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`);
}


function createProposalReceipt(type: AutonomousImprovementProposal['receipts'][number]['type'], summary: string) {
  return { id: randomUUID(), type, summary, issuedAt: now() };
}

function normalizeProposal(input: {
  title: string;
  summary: string;
  rationale: string;
  affectedFiles?: string[];
  riskLevel?: AutonomousImprovementProposal['riskLevel'];
  proposedDiff?: string;
  implementationNotes?: string;
  changes?: unknown[];
  proposedBy?: AutonomousImprovementProposal['proposedBy'];
}): AutonomousImprovementProposal {
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const rationale = String(input.rationale || '').trim();
  if (!title || !summary || !rationale) throw new Error('proposal title, summary, and rationale are required');
  if (!input.proposedDiff && !input.implementationNotes && !input.changes?.length) {
    throw new Error('proposal requires proposedDiff, implementationNotes, or executable changes');
  }
  const riskLevel = input.riskLevel === 'high' || input.riskLevel === 'medium' || input.riskLevel === 'low' ? input.riskLevel : 'medium';
  const createdAt = now();
  const id = randomUUID();
  return {
    id,
    title,
    summary,
    rationale,
    affectedFiles: (input.affectedFiles || []).map(String).map((item) => item.trim()).filter(Boolean),
    riskLevel,
    ...(input.proposedDiff ? { proposedDiff: String(input.proposedDiff) } : {}),
    ...(input.implementationNotes ? { implementationNotes: String(input.implementationNotes) } : {}),
    ...(input.changes?.length ? { changes: input.changes } : {}),
    status: 'proposed',
    proposedBy: input.proposedBy || 'nexora',
    createdAt,
    receipts: [createProposalReceipt('proposal_created', `Proposal ${id} created: ${title}`)],
  };
}

function createReceipt(task: DelegatedTask): TaskReceipt {
  return {
    id: randomUUID(),
    taskId: task.id,
    parentAgent: task.parentAgent,
    assignedAgent: task.assignedAgent,
    status: task.status,
    executionOrigin: task.executionOrigin,
    rootTaskId: task.rootTaskId,
    ...(task.parentTaskId ? { parentTaskId: task.parentTaskId } : {}),
    delegationChain: task.delegationChain,
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
    const authorizationSource = input.authorizationSource || 'autonomous';
    const taskId = randomUUID();
    const executionOrigin = normalizeExecutionOrigin(input.executionOrigin, authorizationSource);
    const parentTask = input.parentTaskId ? tasks.find((candidate) => candidate.id === input.parentTaskId) : undefined;
    const rootTaskId = input.rootTaskId || parentTask?.rootTaskId || input.parentTaskId || taskId;
    const delegationChain = parentTask ? [...parentTask.delegationChain, taskId] : [taskId];
    const originContext = { executionOrigin, rootTaskId, parentTaskId: input.parentTaskId, delegationChain };
    const approvalRequirements = normalizeApprovalRequirements(input.approvalRequirements, authorizationSource, executionOrigin);
    const task: DelegatedTask = {
      id: taskId,
      sessionId: input.sessionId,
      parentAgent: 'elora',
      assignedAgent: 'nexora',
      objective: input.objective,
      constraints: input.constraints || [],
      requiredTools: input.requiredTools || [],
      approvalRequirements,
      authorizationSource,
      executionOrigin,
      rootTaskId,
      ...(input.parentTaskId ? { parentTaskId: input.parentTaskId } : {}),
      delegationChain,
      ...(input.executionPlan?.length
        ? { executionPlan: input.executionPlan.map((step, index) => normalizeExecutionPlanStep(step, index + 1, authorizationSource, originContext)) }
        : {}),
      status: 'queued',
      logs: input.initialLog ? [input.initialLog] : [],
      events: [],
      auditTrail: [],
      createdAt: now(),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      updatedAt: now(),
    };
    const status: DelegatedTaskStatus = hasPendingTaskApprovalGate(task) ? 'pending_approval' : 'queued';
    task.status = status;

    const created = createAuditEntry(task.id, 'task.created', 'elora', `Elora delegated task to Nexora: ${task.objective}`, {
      sessionId: task.sessionId,
      parentAgent: task.parentAgent,
      assignedAgent: task.assignedAgent,
      requiredTools: task.requiredTools,
      authorizationSource: task.authorizationSource,
      executionOrigin: task.executionOrigin,
      rootTaskId: task.rootTaskId,
      parentTaskId: task.parentTaskId,
      delegationChain: task.delegationChain,
    }, originContext);
    task.events.push(created);
    task.auditTrail.push(created);
    if (status === 'pending_approval') {
      const approval = createAuditEntry(task.id, 'task.approval_requested', 'system', 'Task is waiting for required approval before queueing.', {
        approvalRequirements,
      }, originContext);
      const approvalNeeded = createAuditEntry(task.id, 'task.approval_needed', 'system', 'Task needs approval before queueing.', {
        approvalRequirements,
      }, originContext);
      task.events.push(approval, approvalNeeded);
      task.auditTrail.push(approval, approvalNeeded);
    } else {
      const queued = createAuditEntry(task.id, 'task.queued', 'system', 'Task was added to the durable Nexora queue.', { authorizationSource: task.authorizationSource, executionOrigin: task.executionOrigin }, originContext);
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
    const event = createAuditEntry(task.id, eventType, options.actor || 'system', summary, await sanitizeDetails(task.id, eventType, options.details));
    task.events.push(event);
    task.auditTrail.push(event);
    if (options.log) appendBoundedTaskLog(task, summary);
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
    const step = normalizeExecutionPlanStep(input, nextOrder, task.authorizationSource, task);
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
      task,
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
    const previousCurrentStepId = currentWorkerStep(task)?.id;

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
        scope: input.approval.scope ?? step.approval?.scope,
      };
      step.approvalStatus = status;
    }
    if (input.status !== undefined) {
      step.status = input.status;
      if (input.status === 'running' && !step.startedAt) step.startedAt = now();
      if (['completed', 'failed', 'skipped', 'cancelled'].includes(input.status) && !step.finishedAt) step.finishedAt = now();
    }
    if (input.resultSummary !== undefined) step.resultSummary = input.resultSummary;
    if (input.timeoutMs !== undefined) step.timeoutMs = input.timeoutMs;
    step.updatedAt = now();
    sortExecutionPlan(task);

    const event = createAuditEntry(task.id, 'task.log', 'system', `Execution plan step ${step.id} updated.`, {
      executionPlanStep: step,
    });
    task.events.push(event);
    task.auditTrail.push(event);
    const currentStep = currentWorkerStep(task);
    const currentStepEvent = currentStep?.id !== previousCurrentStepId
      ? createAuditEntry(task.id, 'task.current_step_changed', 'system', currentStep ? `Current execution step changed to ${currentStep.id}.` : 'Current execution step cleared.', {
          previousStepId: previousCurrentStepId,
          currentStep,
        })
      : undefined;
    if (currentStepEvent) {
      task.events.push(currentStepEvent);
      task.auditTrail.push(currentStepEvent);
    }
    task.updatedAt = now();
    await persistTasks();
    await Promise.all([event, ...(currentStepEvent ? [currentStepEvent] : [])].map(appendAuditJsonl));
    taskEvents.emitTaskUpdated(task, currentStepEvent || event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function updateDelegatedTask(taskId: string, input: UpdateDelegatedTaskInput) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    if (terminalStatuses.has(task.status) && input.status && input.status !== task.status) return task;

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
      appendBoundedTaskLog(task, input.log);
      const logEvent = createAuditEntry(task.id, 'task.log', input.event?.actor || 'system', input.log);
      task.events.push(logEvent);
      task.auditTrail.push(logEvent);
      newEvents.push(logEvent);
      event = logEvent;
    }

    if (input.blockedReason !== undefined) task.blockedReason = input.blockedReason;
    if (input.pendingToolAction !== undefined) task.pendingToolAction = input.pendingToolAction;

    if (input.status === 'blocked' && (task.pendingToolAction || task.blockedReason === 'step_approval_required')) {
      const approvalEvent = createAuditEntry(task.id, 'task.approval_needed', input.event?.actor || 'system', 'Task needs approval before execution can continue.', {
        blockedReason: task.blockedReason,
        pendingToolAction: task.pendingToolAction,
        missingApproval: missingApproval(task),
      });
      task.events.push(approvalEvent);
      task.auditTrail.push(approvalEvent);
      newEvents.push(approvalEvent);
      event = approvalEvent;
    }

    if (input.status === 'blocked' && task.blockedReason === 'provider_configuration_required') {
      const providerEvent = createAuditEntry(task.id, 'task.provider_blocked', input.event?.actor || 'system', 'Task is blocked by provider configuration.', missingConfiguration(task));
      task.events.push(providerEvent);
      task.auditTrail.push(providerEvent);
      newEvents.push(providerEvent);
      event = providerEvent;
    }

    if (input.commandOutputChunk) {
      const outputSummary = await commandOutputSummary(task.id, input.commandOutputChunk);
      if (outputSummary.fullLog) {
        task.logReferences ||= [];
        task.logReferences.push(outputSummary.fullLog);
      }
      const commandEvent = createAuditEntry(task.id, 'task.command_output_chunk', input.event?.actor || 'nexora', `Command ${outputSummary.stream || 'combined'} output chunk recorded.`, {
        ...(input.commandOutputChunk.command ? { command: input.commandOutputChunk.command } : {}),
        ...(input.commandOutputChunk.stepId ? { stepId: input.commandOutputChunk.stepId } : {}),
        output: outputSummary,
      });
      task.events.push(commandEvent);
      task.auditTrail.push(commandEvent);
      newEvents.push(commandEvent);
      event = commandEvent;
    }

    if (input.result) {
      task.result = await sanitizeResult(task.id, input.result);
      const resultEvent = createAuditEntry(task.id, 'task.result_recorded', input.event?.actor || 'nexora', task.result.summary, {
        ok: task.result.ok,
        data: task.result.data,
        error: task.result.error,
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
        await sanitizeDetails(task.id, input.event.type || 'task.log', input.event.details),
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
      const receiptEvent = createAuditEntry(task.id, 'task.completion_receipt', 'system', `Receipt ${task.receipt.id} created for task ${task.id}.`, {
        receiptId: task.receipt.id,
        executionOrigin: task.executionOrigin,
        rootTaskId: task.rootTaskId,
        parentTaskId: task.parentTaskId,
        delegationChain: task.delegationChain,
      }, task);
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
    task.executionPlan = task.executionPlan?.map((step) =>
      step.approval?.required && step.approvalStatus === 'pending'
        ? {
            ...step,
            approvalStatus: 'approved',
            approval: {
              ...step.approval,
              status: 'approved',
              approver,
              approvedAt,
              note: note || step.approval.note,
            },
            updatedAt: approvedAt,
          }
        : step,
    );
    const status: DelegatedTaskStatus = hasPendingTaskApprovalGate(task) ? 'pending_approval' : 'queued';
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

export async function cancelDelegatedTask(taskId: string, actor: TaskAuditEntry['actor'] = 'user', reason = 'Task cancellation requested.') {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    if (terminalStatuses.has(task.status)) return task;

    const previousStatus = task.status;
    const timestamp = now();
    applyStatusTimestamps(task, 'cancelled');
    task.blockedReason = undefined;
    task.pendingToolAction = undefined;
    task.result = {
      ok: false,
      summary: reason || 'Task was cancelled.',
      data: { previousStatus },
      error: { message: reason || 'Task was cancelled.' },
    };
    task.executionPlan = task.executionPlan?.map((step) =>
      ['completed', 'failed', 'skipped', 'cancelled'].includes(step.status)
        ? step
        : { ...step, status: 'cancelled', resultSummary: reason || 'Task was cancelled.', finishedAt: timestamp, updatedAt: timestamp },
    );

    const requested = createAuditEntry(task.id, 'task.cancellation_requested', actor, reason || 'Task cancellation requested.', { previousStatus });
    const cancelled = createAuditEntry(task.id, 'task.cancelled', 'system', `Task cancelled from ${previousStatus}.`, { previousStatus, reason });
    task.events.push(requested, cancelled);
    task.auditTrail.push(requested, cancelled);
    task.receipt = createReceipt(task);
    const receiptEvent = createAuditEntry(task.id, 'task.completion_receipt', 'system', `Receipt ${task.receipt.id} created for cancelled task ${task.id}.`, { receiptId: task.receipt.id });
    task.events.push(receiptEvent);
    task.auditTrail.push(receiptEvent);
    task.receipt.proof.auditTrail = task.auditTrail;
    task.updatedAt = now();
    await persistTasks();
    await Promise.all([requested, cancelled, receiptEvent].map(appendAuditJsonl));
    taskEvents.emitTaskUpdated(task, cancelled, getDelegatedTaskUiState(task));
    taskEvents.emitTaskFinished(task, getDelegatedTaskUiState(task));
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
    const originalPendingToolAction = task.pendingToolAction;
    const approvedAt = now();
    step.approvalStatus = 'approved';
    step.approval = { ...(step.approval || { required: true, status: 'approved' as const }), status: 'approved', approver, approvedAt, note: note || step.approval?.note };
    step.status = 'queued';
    step.updatedAt = approvedAt;
    task.blockedReason = undefined;
    task.pendingToolAction = undefined;
    applyStatusTimestamps(task, 'queued');
    const event = createAuditEntry(task.id, 'task.approved', 'user', `Step ${step.id} approval recorded by ${approver}.`, {
      taskId: task.id,
      stepId,
      pendingToolAction: {
        stepId,
        toolName: step.targetTool,
        arguments: step.arguments,
        argumentTemplate: step.argumentTemplate,
        approvalScope: originalPendingToolAction?.approvalScope ?? step.approval?.scope,
        reason: originalPendingToolAction?.reason,
      },
      note,
    });
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


export async function createAutonomousImprovementProposal(taskId: string, input: Parameters<typeof normalizeProposal>[0]) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task) return undefined;
    const proposal = normalizeProposal(input);
    task.proposal = proposal;
    const event = createAuditEntry(task.id, 'proposal.created', proposal.proposedBy === 'core' ? 'system' : proposal.proposedBy, proposal.receipts[0].summary, { proposal });
    task.events.push(event);
    task.auditTrail.push(event);
    task.updatedAt = now();
    await persistTasks();
    await appendAuditJsonl(event);
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function markAutonomousImprovementProposalApproved(taskId: string, approver = 'user', note = '') {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task?.proposal) return undefined;
    const timestamp = now();
    const receipt = createProposalReceipt('proposal_approved', `Proposal ${task.proposal.id} approved by ${approver}.`);
    task.proposal = { ...task.proposal, status: 'approved', approvedAt: timestamp, approvedBy: approver, receipts: [...task.proposal.receipts, receipt] };
    const event = createAuditEntry(task.id, 'proposal.approved', 'user', receipt.summary, { proposalId: task.proposal.id, note });
    task.events.push(event);
    task.auditTrail.push(event);
    task.updatedAt = timestamp;
    await persistTasks();
    await appendAuditJsonl(event);
    taskEvents.emitTaskUpdated(task, event, getDelegatedTaskUiState(task));
    return task;
  });
}

export async function markAutonomousImprovementProposalApplied(taskId: string, summary: string, details?: Record<string, unknown>) {
  return serializedWrite(async () => {
    const task = await getDelegatedTask(taskId);
    if (!task?.proposal) return undefined;
    const timestamp = now();
    const appliedReceipt = createProposalReceipt('patch_applied', summary || `Proposal ${task.proposal.id} patch applied.`);
    const completedReceipt = createProposalReceipt('proposal_completed', `Proposal ${task.proposal.id} completed.`);
    task.proposal = { ...task.proposal, status: 'completed', appliedAt: timestamp, completedAt: timestamp, receipts: [...task.proposal.receipts, appliedReceipt, completedReceipt] };
    const applied = createAuditEntry(task.id, 'proposal.patch_applied', 'nexora', appliedReceipt.summary, { proposalId: task.proposal.id, ...details });
    const completed = createAuditEntry(task.id, 'proposal.completed', 'system', completedReceipt.summary, { proposalId: task.proposal.id });
    task.events.push(applied, completed);
    task.auditTrail.push(applied, completed);
    task.updatedAt = timestamp;
    await persistTasks();
    await Promise.all([applied, completed].map(appendAuditJsonl));
    taskEvents.emitTaskUpdated(task, completed, getDelegatedTaskUiState(task));
    return task;
  });
}
