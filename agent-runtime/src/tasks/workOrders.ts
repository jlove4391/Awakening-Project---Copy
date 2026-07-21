import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import type { RuntimeContext } from '../types.js';
import { redactForLogs } from '../workflows/nexora/secretsPolicy.js';
import type { DelegatedTask, ExecutionPlanStep } from './types.js';

export const nexoraWorkOrderStates = [
  'draft',
  'ready',
  'queued',
  'running',
  'validating',
  'blocked',
  'completed',
  'failed',
  'cancelled',
] as const;

export type NexoraWorkOrderState = (typeof nexoraWorkOrderStates)[number];
export type NexoraWorkOrderTerminalState = Extract<NexoraWorkOrderState, 'completed' | 'failed' | 'cancelled'>;
export type NexoraWorkOrderValidationStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface NexoraWorkOrderContextReferences {
  commandId?: string;
  contextBundleId?: string;
  identityIds: string[];
  memoryIds: string[];
  relationshipEntryIds: string[];
  taskIds: string[];
  commandIds: string[];
  executionIds: string[];
  receiptIds: string[];
  trustDomains: string[];
}

export interface NexoraWorkOrderScope {
  workspaceRoot: string;
  allowedPaths: string[];
  deniedPaths: string[];
  allowCommands: boolean;
  allowGitCommit: boolean;
  allowExternalWrites: boolean;
}

export interface NexoraWorkOrderPlanStep {
  id: string;
  order: number;
  tool: string;
  purpose: string;
  arguments?: unknown;
  taskStepId?: string;
  status: ExecutionPlanStep['status'];
  approvalStatus: ExecutionPlanStep['approvalStatus'];
}

export interface NexoraWorkOrderAcceptanceCriterion {
  id: string;
  description: string;
  required: boolean;
  status: NexoraWorkOrderValidationStatus;
  evidence: string[];
}

export interface NexoraWorkOrderValidationCheck {
  id: string;
  kind: 'plan_step' | 'artifact_read' | 'plan_complete';
  description: string;
  required: boolean;
  tool?: string;
  arguments?: Record<string, unknown>;
  sourceStepId?: string;
  status: NexoraWorkOrderValidationStatus;
  resultSummary?: string;
}

export interface NexoraWorkOrderEvidence {
  toolsUsed: string[];
  commandsRun: string[];
  artifactsChanged: string[];
  stepResults: Array<{
    stepId: string;
    tool: string;
    status: 'completed' | 'failed' | 'blocked' | 'skipped';
    summary: string;
    result?: unknown;
  }>;
  validationResults: Array<{
    checkId: string;
    status: NexoraWorkOrderValidationStatus;
    summary: string;
  }>;
  errors: string[];
  remainingWork: string[];
  receiptIds: string[];
}

export interface NexoraWorkOrderStateEvent {
  id: string;
  from?: NexoraWorkOrderState;
  to: NexoraWorkOrderState;
  occurredAt: string;
  actor: 'elora' | 'nexora' | 'system' | 'user';
  summary: string;
  details?: Record<string, unknown>;
}

export interface NexoraWorkOrder {
  id: string;
  version: '1.0';
  receiptId: string;
  taskId: string;
  sessionId: string;
  objective: string;
  scope: NexoraWorkOrderScope;
  constraints: string[];
  outOfScope: string[];
  requiredTools: string[];
  contextReferences: NexoraWorkOrderContextReferences;
  executionPlan: NexoraWorkOrderPlanStep[];
  acceptanceCriteria: NexoraWorkOrderAcceptanceCriterion[];
  validationPlan: NexoraWorkOrderValidationCheck[];
  rollbackGuidance: string;
  outputContract: {
    deliverable: string;
    requiredFields: string[];
    mustReturnTo: 'elora';
  };
  state: NexoraWorkOrderState;
  stateHistory: NexoraWorkOrderStateEvent[];
  evidence: NexoraWorkOrderEvidence;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  validatingAt?: string;
  finishedAt?: string;
}

export interface NexoraWorkOrderPatch {
  executionPlan?: NexoraWorkOrderPlanStep[];
  acceptanceCriteria?: NexoraWorkOrderAcceptanceCriterion[];
  validationPlan?: NexoraWorkOrderValidationCheck[];
  evidence?: Partial<NexoraWorkOrderEvidence>;
  rollbackGuidance?: string;
}

export class NexoraWorkOrderValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid Nexora work order: ${issues.join('; ')}`);
    this.name = 'NexoraWorkOrderValidationError';
    this.issues = issues;
  }
}

const workOrderDir = path.join(runtimeConfig.dataDir, 'tasks');
const workOrderPath = path.join(workOrderDir, 'nexora-work-orders.json');
const workOrderAuditPath = path.join(workOrderDir, 'nexora-work-order-audit.jsonl');
let cache: NexoraWorkOrder[] | undefined;
let writeChain = Promise.resolve();

const terminalStates = new Set<NexoraWorkOrderState>(['completed', 'failed', 'cancelled']);
const writeTools = new Set([
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
const explicitValidationTools = new Set([
  'code.test',
  'code.diff',
  'code.git_diff',
  'code.git_status',
  'vscode.status',
]);

const legalTransitions: Record<NexoraWorkOrderState, NexoraWorkOrderState[]> = {
  draft: ['ready', 'failed', 'cancelled'],
  ready: ['queued', 'blocked', 'failed', 'cancelled'],
  queued: ['running', 'blocked', 'failed', 'cancelled'],
  running: ['queued', 'validating', 'blocked', 'failed', 'cancelled'],
  validating: ['queued', 'completed', 'blocked', 'failed', 'cancelled'],
  blocked: ['queued', 'running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

function now() {
  return new Date().toISOString();
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeRelativePath(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return undefined;
  return normalized;
}

function pathValues(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    if (/^(path|file|filePath|targetPath|destination|to|workingDirectory)$/i.test(key)) {
      const candidate = safeRelativePath(entry);
      if (candidate) paths.push(candidate);
    }
  }
  return unique(paths);
}

function commandValue(value: unknown) {
  if (!isRecord(value)) return undefined;
  for (const key of ['command', 'script']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
  }
  return undefined;
}

function defaultInputForTool(tool: string, task: DelegatedTask): Record<string, unknown> | undefined {
  const objective = task.objective;
  switch (tool.toLowerCase()) {
    case 'code':
    case 'workspace':
    case 'repository':
    case 'project':
    case 'code.project_summary':
      return { path: '.', maxFiles: 2000, maxItems: 100 };
    case 'context':
    case 'memory':
    case 'memory.retrieve':
      return { query: objective, limit: 10, scopes: [] };
    case 'diff':
    case 'code.diff':
      return { path: '' };
    case 'package':
    case 'code.package_scripts':
      return { path: '.', maxFiles: 2000, maxItems: 50 };
    case 'configs':
    case 'code.find_configs':
      return { path: '.', maxFiles: 2000, maxItems: 100 };
    case 'entrypoints':
    case 'code.find_entrypoints':
      return { path: '.', maxFiles: 2000, maxItems: 100 };
    default:
      return tool.includes('.') ? {} : undefined;
  }
}

function canonicalToolName(tool: string) {
  switch (tool.toLowerCase()) {
    case 'code':
    case 'workspace':
    case 'repository':
    case 'project':
      return 'code.project_summary';
    case 'context':
    case 'memory':
      return 'memory.retrieve';
    case 'diff':
      return 'code.diff';
    case 'package':
      return 'code.package_scripts';
    case 'configs':
      return 'code.find_configs';
    case 'entrypoints':
      return 'code.find_entrypoints';
    default:
      return tool;
  }
}

function synthesizeExecutionPlan(task: DelegatedTask): NexoraWorkOrderPlanStep[] {
  if (task.executionPlan?.length) {
    return [...task.executionPlan]
      .sort((left, right) => left.order - right.order)
      .map((step) => ({
        id: `wo_step_${step.id}`,
        taskStepId: step.id,
        order: step.order,
        tool: step.targetTool,
        purpose: `Execute ${step.targetTool} for the bounded objective.`,
        ...(step.arguments !== undefined ? { arguments: redactForLogs(step.arguments) } : step.argumentTemplate !== undefined ? { arguments: redactForLogs(step.argumentTemplate) } : {}),
        status: step.status,
        approvalStatus: step.approvalStatus,
      }));
  }

  return task.requiredTools.flatMap((requestedTool, index) => {
    const tool = canonicalToolName(requestedTool.trim());
    const argumentsValue = defaultInputForTool(requestedTool, task);
    if (!tool || !argumentsValue) return [];
    return [{
      id: `wo_step_${randomUUID()}`,
      order: index + 1,
      tool,
      purpose: `Execute ${tool} for the bounded objective.`,
      arguments: argumentsValue,
      status: 'queued' as const,
      approvalStatus: 'not_required' as const,
    }];
  });
}

function inferredArtifactPaths(plan: NexoraWorkOrderPlanStep[]) {
  return unique(plan.filter((step) => writeTools.has(step.tool)).flatMap((step) => pathValues(step.arguments)));
}

function buildValidationPlan(plan: NexoraWorkOrderPlanStep[]): NexoraWorkOrderValidationCheck[] {
  const checks: NexoraWorkOrderValidationCheck[] = [];
  for (const step of plan) {
    if (explicitValidationTools.has(step.tool) || commandTools.has(step.tool)) {
      checks.push({
        id: `validation_${randomUUID()}`,
        kind: 'plan_step',
        description: `Confirm ${step.tool} completed successfully.`,
        required: true,
        tool: step.tool,
        sourceStepId: step.taskStepId,
        status: 'pending',
      });
    }
  }
  for (const artifactPath of inferredArtifactPaths(plan)) {
    checks.push({
      id: `validation_${randomUUID()}`,
      kind: 'artifact_read',
      description: `Read ${artifactPath} after mutation to verify the resulting artifact is accessible inside the workspace.`,
      required: true,
      tool: 'code.read',
      arguments: { path: artifactPath },
      status: 'pending',
    });
  }
  if (!checks.length) {
    checks.push({
      id: `validation_${randomUUID()}`,
      kind: 'plan_complete',
      description: 'Confirm every required execution-plan step reached a successful terminal state.',
      required: true,
      status: 'pending',
    });
  }
  return checks;
}

function buildAcceptanceCriteria(plan: NexoraWorkOrderPlanStep[]) {
  const criteria: NexoraWorkOrderAcceptanceCriterion[] = [
    {
      id: `acceptance_${randomUUID()}`,
      description: 'The bounded objective is completed without expanding beyond the declared workspace scope.',
      required: true,
      status: 'pending',
      evidence: [],
    },
    {
      id: `acceptance_${randomUUID()}`,
      description: 'All required execution and validation steps complete successfully or return an explicit blocker.',
      required: true,
      status: 'pending',
      evidence: [],
    },
  ];
  if (plan.some((step) => writeTools.has(step.tool))) {
    criteria.push({
      id: `acceptance_${randomUUID()}`,
      description: 'Every changed artifact is recorded with validation and rollback guidance.',
      required: true,
      status: 'pending',
      evidence: [],
    });
  }
  return criteria;
}

function contextReferences(context?: RuntimeContext): NexoraWorkOrderContextReferences {
  const references = context?.coreContext?.references;
  return {
    ...(context?.commandId ? { commandId: context.commandId } : {}),
    ...(context?.coreContext?.id ? { contextBundleId: context.coreContext.id } : {}),
    identityIds: references?.identityIds || [],
    memoryIds: references?.memoryIds || [],
    relationshipEntryIds: references?.relationshipEntryIds || [],
    taskIds: references?.taskIds || [],
    commandIds: references?.commandIds || [],
    executionIds: references?.executionIds || [],
    receiptIds: references?.receiptIds || [],
    trustDomains: references?.trustDomains || [],
  };
}

function validationIssues(order: Pick<NexoraWorkOrder, 'objective' | 'scope' | 'executionPlan' | 'acceptanceCriteria' | 'validationPlan' | 'rollbackGuidance'>) {
  const issues: string[] = [];
  if (!order.objective.trim()) issues.push('objective is required');
  if (order.scope.workspaceRoot !== runtimeConfig.codeWorkspaceRoot) issues.push('workspace scope must equal the configured Nexora workspace root');
  if (!order.scope.allowedPaths.length) issues.push('at least one allowed workspace path is required');
  if (order.scope.allowedPaths.some((item) => !safeRelativePath(item) && item !== '.')) issues.push('allowed paths must be safe workspace-relative paths');
  if (!order.executionPlan.length) issues.push('at least one executable or inspectable plan step is required');
  if (new Set(order.executionPlan.map((step) => step.id)).size !== order.executionPlan.length) issues.push('execution-plan step IDs must be unique');
  if (order.executionPlan.some((step) => !step.tool.trim())) issues.push('every execution-plan step requires a tool');
  if (!order.acceptanceCriteria.length) issues.push('at least one acceptance criterion is required');
  if (!order.validationPlan.length) issues.push('at least one validation check is required');
  if (!order.rollbackGuidance.trim()) issues.push('rollback guidance is required');
  return issues;
}

async function ensureStore() {
  await fs.mkdir(workOrderDir, { recursive: true });
}

async function loadWorkOrders() {
  if (cache) return cache;
  await ensureStore();
  try {
    cache = JSON.parse(await fs.readFile(workOrderPath, 'utf8')) as NexoraWorkOrder[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cache = [];
    await persistWorkOrders();
  }
  return cache;
}

async function persistWorkOrders() {
  await ensureStore();
  await fs.writeFile(workOrderPath, `${JSON.stringify(cache || [], null, 2)}\n`);
}

async function appendAudit(event: NexoraWorkOrderStateEvent & { workOrderId: string; taskId: string }) {
  await ensureStore();
  await fs.appendFile(workOrderAuditPath, `${JSON.stringify(event)}\n`);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

export function assertNexoraWorkOrder(order: NexoraWorkOrder) {
  const issues = validationIssues(order);
  if (issues.length) throw new NexoraWorkOrderValidationError(issues);
  return order;
}

export async function createNexoraWorkOrderForTask(task: DelegatedTask, context?: RuntimeContext) {
  return serializedWrite(async () => {
    const workOrders = await loadWorkOrders();
    const existing = workOrders.find((candidate) => candidate.taskId === task.id);
    if (existing) return existing;

    const timestamp = now();
    const executionPlan = synthesizeExecutionPlan(task);
    const artifactPaths = inferredArtifactPaths(executionPlan);
    const hasMutation = executionPlan.some((step) => writeTools.has(step.tool));
    const draftEvent: NexoraWorkOrderStateEvent = {
      id: randomUUID(),
      to: 'draft',
      occurredAt: timestamp,
      actor: 'elora',
      summary: `Elora created a bounded Nexora work order for task ${task.id}.`,
    };
    const readyEvent: NexoraWorkOrderStateEvent = {
      id: randomUUID(),
      from: 'draft',
      to: 'ready',
      occurredAt: timestamp,
      actor: 'system',
      summary: 'The Nexora work order passed contract validation.',
    };
    const order: NexoraWorkOrder = {
      id: `work_${randomUUID()}`,
      version: '1.0',
      receiptId: `work_receipt_${randomUUID()}`,
      taskId: task.id,
      sessionId: task.sessionId,
      objective: task.objective.trim(),
      scope: {
        workspaceRoot: runtimeConfig.codeWorkspaceRoot,
        allowedPaths: artifactPaths.length ? unique(['.', ...artifactPaths]) : ['.'],
        deniedPaths: ['..', '.git', '.env', 'node_modules', 'secrets', 'credentials'],
        allowCommands: executionPlan.some((step) => commandTools.has(step.tool)),
        allowGitCommit: false,
        allowExternalWrites: false,
      },
      constraints: unique(task.constraints),
      outOfScope: [
        'Direct writes or pushes to main.',
        'External sends, publication, purchases, payments, or binding commitments.',
        'Credential, secret, private-data, or workspace-boundary bypasses.',
        'Work not required by the stated objective and acceptance criteria.',
      ],
      requiredTools: unique(executionPlan.map((step) => step.tool)),
      contextReferences: contextReferences(context),
      executionPlan,
      acceptanceCriteria: buildAcceptanceCriteria(executionPlan),
      validationPlan: buildValidationPlan(executionPlan),
      rollbackGuidance: hasMutation
        ? 'Restore affected files from version control or use the recorded pre-change artifact state. Do not push or merge automatically.'
        : 'No workspace mutation is expected; cancel the work order or discard its read-only findings.',
      outputContract: {
        deliverable: task.specialistCall.output_contract.deliverable,
        requiredFields: [
          'workOrderId',
          'terminalStatus',
          'summary',
          'artifactsChanged',
          'toolsUsed',
          'commandsRun',
          'validation',
          'errors',
          'remainingWork',
          'receiptIds',
          'rollbackGuidance',
        ],
        mustReturnTo: 'elora',
      },
      state: 'ready',
      stateHistory: [draftEvent, readyEvent],
      evidence: {
        toolsUsed: [],
        commandsRun: [],
        artifactsChanged: [],
        stepResults: [],
        validationResults: [],
        errors: [],
        remainingWork: [],
        receiptIds: [],
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    assertNexoraWorkOrder(order);
    if (task.status === 'queued') {
      order.state = 'queued';
      order.stateHistory.push({
        id: randomUUID(),
        from: 'ready',
        to: 'queued',
        occurredAt: timestamp,
        actor: 'system',
        summary: 'The validated Nexora work order entered the durable queue.',
      });
    } else if (task.status === 'pending_approval' || task.status === 'blocked') {
      order.state = 'blocked';
      order.stateHistory.push({
        id: randomUUID(),
        from: 'ready',
        to: 'blocked',
        occurredAt: timestamp,
        actor: 'system',
        summary: 'The validated Nexora work order is waiting on an authority or setup boundary.',
      });
    }
    workOrders.unshift(order);
    await persistWorkOrders();
    await Promise.all(order.stateHistory.map((event) => appendAudit({ ...event, workOrderId: order.id, taskId: task.id })));
    return order;
  });
}

export async function getNexoraWorkOrder(workOrderId: string) {
  return (await loadWorkOrders()).find((order) => order.id === workOrderId);
}

export async function getNexoraWorkOrderByTaskId(taskId: string) {
  return (await loadWorkOrders()).find((order) => order.taskId === taskId);
}

export async function listNexoraWorkOrders(sessionId?: string) {
  const workOrders = await loadWorkOrders();
  return sessionId ? workOrders.filter((order) => order.sessionId === sessionId) : workOrders;
}

export async function transitionNexoraWorkOrder(
  taskId: string,
  to: NexoraWorkOrderState,
  options: { actor?: NexoraWorkOrderStateEvent['actor']; summary?: string; details?: Record<string, unknown> } = {},
) {
  return serializedWrite(async () => {
    const workOrders = await loadWorkOrders();
    const order = workOrders.find((candidate) => candidate.taskId === taskId);
    if (!order) return undefined;
    if (order.state === to) return order;
    if (terminalStates.has(order.state)) return order;
    if (!legalTransitions[order.state].includes(to)) {
      throw new Error(`Illegal Nexora work-order transition ${order.state} -> ${to} for ${order.id}`);
    }
    const timestamp = now();
    const event: NexoraWorkOrderStateEvent = {
      id: randomUUID(),
      from: order.state,
      to,
      occurredAt: timestamp,
      actor: options.actor || 'system',
      summary: options.summary || `Nexora work order transitioned from ${order.state} to ${to}.`,
      ...(options.details ? { details: redactForLogs(options.details) as Record<string, unknown> } : {}),
    };
    order.state = to;
    order.stateHistory.push(event);
    order.updatedAt = timestamp;
    if (to === 'running' && !order.startedAt) order.startedAt = timestamp;
    if (to === 'validating' && !order.validatingAt) order.validatingAt = timestamp;
    if (terminalStates.has(to) && !order.finishedAt) order.finishedAt = timestamp;
    await persistWorkOrders();
    await appendAudit({ ...event, workOrderId: order.id, taskId });
    return order;
  });
}

export async function patchNexoraWorkOrder(taskId: string, patch: NexoraWorkOrderPatch) {
  return serializedWrite(async () => {
    const order = (await loadWorkOrders()).find((candidate) => candidate.taskId === taskId);
    if (!order) return undefined;
    if (patch.executionPlan) order.executionPlan = patch.executionPlan;
    if (patch.acceptanceCriteria) order.acceptanceCriteria = patch.acceptanceCriteria;
    if (patch.validationPlan) order.validationPlan = patch.validationPlan;
    if (patch.rollbackGuidance !== undefined) order.rollbackGuidance = patch.rollbackGuidance;
    if (patch.evidence) {
      order.evidence = {
        toolsUsed: unique([...(order.evidence.toolsUsed || []), ...(patch.evidence.toolsUsed || [])]),
        commandsRun: unique([...(order.evidence.commandsRun || []), ...(patch.evidence.commandsRun || [])]),
        artifactsChanged: unique([...(order.evidence.artifactsChanged || []), ...(patch.evidence.artifactsChanged || [])]),
        stepResults: patch.evidence.stepResults || order.evidence.stepResults,
        validationResults: patch.evidence.validationResults || order.evidence.validationResults,
        errors: unique([...(order.evidence.errors || []), ...(patch.evidence.errors || [])]),
        remainingWork: patch.evidence.remainingWork || order.evidence.remainingWork,
        receiptIds: unique([...(order.evidence.receiptIds || []), ...(patch.evidence.receiptIds || [])]),
      };
    }
    order.updatedAt = now();
    assertNexoraWorkOrder(order);
    await persistWorkOrders();
    return order;
  });
}

export async function prepareNexoraWorkOrderForRecovery(task: DelegatedTask) {
  const order = await createNexoraWorkOrderForTask(task);
  if (order.state === 'running' || order.state === 'validating') {
    return transitionNexoraWorkOrder(task.id, 'queued', {
      actor: 'system',
      summary: 'Recovered an interrupted Nexora work order after runtime restart; completed steps remain complete.',
      details: { previousState: order.state },
    });
  }
  return order;
}

export async function enrichTaskWithNexoraWorkOrder<T extends DelegatedTask>(task: T, context?: RuntimeContext) {
  if (task.assignedAgent !== 'nexora') return task;
  const workOrder = await createNexoraWorkOrderForTask(task, context);
  return { ...task, workOrder };
}

export async function clearNexoraWorkOrdersForTesting() {
  return serializedWrite(async () => {
    cache = [];
    await ensureStore();
    await Promise.all([
      fs.writeFile(workOrderPath, '[]\n'),
      fs.writeFile(workOrderAuditPath, ''),
    ]);
  });
}
