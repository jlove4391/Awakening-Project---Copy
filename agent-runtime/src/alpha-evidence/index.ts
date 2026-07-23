import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  assembleCoreContext,
  createCoreCommand,
  decideInitialCommandAuthority,
  getCoreCommand,
  transitionCoreCommand,
  type CoreCommandLinks,
  type CoreCommandRecord,
  type CoreContextBundle,
} from '../core/index.js';
import { getRuntimeContext, persistRuntimeContext } from '../memory/index.js';
import { getCanonicalReceipt, type CanonicalReceipt } from '../receipts.js';
import { createDelegationTask } from '../tools/delegation.js';
import { getDelegatedTask } from '../tasks/store.js';
import { getNexoraWorkOrderByTaskId, type NexoraWorkOrder } from '../tasks/workOrders.js';
import type { CreateDelegatedTaskInput, DelegatedTask, ExecutionPlanStepApproval } from '../tasks/types.js';
import type { ExecutionMode, RuntimeContext } from '../types.js';

export interface AlphaEvidenceCommand {
  command: CoreCommandRecord;
  context: RuntimeContext;
  contextBundle: CoreContextBundle;
}

export interface AlphaEvidenceTaskResult {
  command: CoreCommandRecord;
  contextBundle: CoreContextBundle;
  task: DelegatedTask;
  workOrder: NexoraWorkOrder;
  receipt: CanonicalReceipt;
}

export interface StartAlphaEvidenceCommandInput {
  sessionId: string;
  requestText: string;
  executionMode?: ExecutionMode;
  autonomyLevel?: number;
}

export interface RunAlphaEvidenceTaskInput extends StartAlphaEvidenceCommandInput {
  objective: string;
  constraints?: string[];
  requiredTools: string[];
  executionPlan: CreateDelegatedTaskInput['executionPlan'];
  timeoutMs?: number;
}

function contextLinks(bundle: CoreContextBundle): Partial<CoreCommandLinks> {
  return {
    identityIds: bundle.references.identityIds,
    memoryReferenceIds: bundle.references.memoryIds,
    relationshipEntryIds: bundle.references.relationshipEntryIds,
    priorCommandIds: bundle.references.commandIds,
    taskIds: bundle.references.taskIds,
    executionIds: bundle.references.executionIds,
    receiptIds: bundle.references.receiptIds,
    trustDomains: bundle.references.trustDomains,
  };
}

function primaryReceiptId(task: DelegatedTask) {
  const data = task.result?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const id = (data as Record<string, unknown>).primaryReceiptId;
  return typeof id === 'string' ? id : undefined;
}

export async function startAlphaEvidenceCommand(input: StartAlphaEvidenceCommandInput): Promise<AlphaEvidenceCommand> {
  const executionMode = input.executionMode || 'reactive';
  const context = await getRuntimeContext(input.sessionId);
  context.agent = 'elora';
  context.channel = 'text';
  context.executionMode = executionMode;
  context.autonomyLevel = input.autonomyLevel ?? 0;

  let command = await createCoreCommand({
    sessionId: input.sessionId,
    agent: 'elora',
    requestText: input.requestText,
  });
  context.commandId = command.id;
  const contextBundle = await assembleCoreContext({
    sessionId: input.sessionId,
    requestText: input.requestText,
    agent: 'elora',
    executionMode,
    requestedAutonomyLevel: context.autonomyLevel,
    commandId: command.id,
    subjectId: context.relationshipContext?.subjectId || 'jordan',
  });
  context.coreContext = contextBundle;
  context.relationshipContext = contextBundle.relationship.context;

  command = (await transitionCoreCommand(command.id, 'context_assembled', {
    summary: 'Alpha evidence command assembled durable production context.',
    context: {
      bundleId: contextBundle.id,
      assembledAt: contextBundle.assembledAt,
      identityId: contextBundle.identity.id,
      relationshipSubjectId: contextBundle.relationship.context.subjectId,
      relationshipEntryIds: contextBundle.references.relationshipEntryIds,
      trustDomain: contextBundle.executionEnvelope.primaryTrustDomain,
      trustScore: contextBundle.executionEnvelope.trustScore,
      autonomyEnvelope: contextBundle.executionEnvelope.autonomyEnvelope,
      validationRequirement: contextBundle.executionEnvelope.validationRequirement,
      scopeLimit: contextBundle.executionEnvelope.scopeLimit,
      activeObjective: input.requestText,
    },
    links: contextLinks(contextBundle),
  })).command;
  command = (await transitionCoreCommand(command.id, 'authority_decided', {
    summary: 'Alpha evidence command authority was decided through the normal CORE envelope.',
    authority: decideInitialCommandAuthority({
      executionMode,
      autonomyLevel: context.autonomyLevel,
      executionEnvelope: contextBundle.executionEnvelope,
    }),
  })).command;
  command = (await transitionCoreCommand(command.id, 'planning', {
    summary: 'Elora prepared a bounded evidence plan using production services.',
  })).command;
  command = (await transitionCoreCommand(command.id, 'executing', {
    summary: 'The Alpha evidence command entered normal bounded execution.',
  })).command;
  await persistRuntimeContext(context);
  return { command, context, contextBundle };
}

export async function waitForAlphaEvidenceTask(
  taskId: string,
  predicate: (task: DelegatedTask) => boolean,
  timeoutMs = 30_000,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const task = await getDelegatedTask(taskId);
    if (task && predicate(task)) return task;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const latest = await getDelegatedTask(taskId);
  throw new Error(`Timed out waiting for Alpha evidence task ${taskId}. status=${latest?.status}; reason=${latest?.blockedReason}; summary=${latest?.result?.summary}`);
}

export async function completeAlphaEvidenceCommand(
  commandId: string,
  task: DelegatedTask,
  workOrder: NexoraWorkOrder,
  receipt: CanonicalReceipt,
  memoryCandidateIds: string[] = [],
) {
  let command = await getCoreCommand(commandId);
  if (!command) throw new Error(`CORE command not found: ${commandId}`);
  const links: Partial<CoreCommandLinks> = {
    taskIds: [task.id],
    executionIds: receipt.links.executionIds,
    receiptIds: [receipt.id],
    memoryCandidateIds,
    trustDomains: [receipt.trustDomain],
  };
  if (command.state === 'executing') {
    command = (await transitionCoreCommand(command.id, 'delegated', {
      summary: `Elora delegated bounded execution to Nexora work order ${workOrder.id}.`,
      links,
    })).command;
  }
  command = (await transitionCoreCommand(command.id, 'validating', {
    summary: 'Nexora work-order validation evidence was inspected.',
    links,
  })).command;
  command = (await transitionCoreCommand(command.id, 'receipted', {
    summary: `Primary canonical receipt ${receipt.id} is linked to the command.`,
    links,
  })).command;
  command = (await transitionCoreCommand(command.id, 'memory_candidates_recorded', {
    summary: memoryCandidateIds.length ? 'Evidence-backed memory candidates were recorded for review.' : 'No memory candidate was produced by this evidence command.',
    links,
  })).command;
  command = (await transitionCoreCommand(command.id, 'response_synthesized', {
    summary: 'Elora synthesized the evidence result from durable command, work-order, validation, and receipt state.',
    finalOutput: task.result,
  })).command;
  command = (await transitionCoreCommand(command.id, 'completed', {
    summary: 'The real Alpha evidence command completed successfully.',
    finalOutput: task.result,
  })).command;
  return command;
}

export async function runCompletedAlphaEvidenceTask(input: RunAlphaEvidenceTaskInput): Promise<AlphaEvidenceTaskResult> {
  const started = await startAlphaEvidenceCommand(input);
  const created = await createDelegationTask({
    objective: input.objective,
    constraints: input.constraints || [],
    requiredTools: input.requiredTools,
    executionPlan: input.executionPlan,
    timeoutMs: input.timeoutMs,
    authorizationSource: 'user_delegated',
    assignedAgent: 'nexora',
    memoryContext: started.contextBundle.memories.map((memory) => ({ id: memory.id, status: memory.status, category: memory.category })),
    outputContract: {
      deliverable: 'Return validated Alpha evidence to Elora with the primary canonical receipt.',
      expected_format: 'receipt',
    },
  }, started.context) as DelegatedTask & { workOrder?: NexoraWorkOrder };

  let command = (await transitionCoreCommand(started.command.id, 'delegated', {
    summary: `Elora created bounded Nexora task ${created.id}.`,
    links: { taskIds: [created.id] },
  })).command;
  const task = await waitForAlphaEvidenceTask(
    created.id,
    (candidate) => candidate.status === 'completed' && Boolean(primaryReceiptId(candidate)),
    input.timeoutMs || 30_000,
  );
  const workOrder = await getNexoraWorkOrderByTaskId(task.id);
  if (!workOrder) throw new Error(`Nexora work order not found for task ${task.id}`);
  const receiptId = primaryReceiptId(task);
  if (!receiptId) throw new Error(`Primary canonical receipt not linked to task ${task.id}`);
  const receipt = await getCanonicalReceipt(receiptId);
  if (!receipt) throw new Error(`Canonical receipt not found: ${receiptId}`);
  command = await completeAlphaEvidenceCommand(command.id, task, workOrder, receipt);
  return { command, contextBundle: started.contextBundle, task, workOrder, receipt };
}

export async function runBlockedAlphaEvidenceTask(input: RunAlphaEvidenceTaskInput): Promise<AlphaEvidenceTaskResult> {
  const started = await startAlphaEvidenceCommand(input);
  const created = await createDelegationTask({
    objective: input.objective,
    constraints: input.constraints || [],
    requiredTools: input.requiredTools,
    executionPlan: input.executionPlan,
    timeoutMs: input.timeoutMs,
    authorizationSource: 'user_delegated',
    assignedAgent: 'nexora',
    memoryContext: started.contextBundle.memories.map((memory) => ({ id: memory.id, status: memory.status, category: memory.category })),
  }, started.context) as DelegatedTask;
  let command = (await transitionCoreCommand(started.command.id, 'delegated', {
    summary: `Elora created bounded Nexora task ${created.id}.`,
    links: { taskIds: [created.id] },
  })).command;
  const task = await waitForAlphaEvidenceTask(
    created.id,
    (candidate) => candidate.status === 'blocked' && Boolean(primaryReceiptId(candidate)),
    input.timeoutMs || 30_000,
  );
  const workOrder = await getNexoraWorkOrderByTaskId(task.id);
  if (!workOrder) throw new Error(`Nexora work order not found for blocked task ${task.id}`);
  const receiptId = primaryReceiptId(task);
  if (!receiptId) throw new Error(`Primary canonical receipt not linked to blocked task ${task.id}`);
  const receipt = await getCanonicalReceipt(receiptId);
  if (!receipt) throw new Error(`Canonical receipt not found: ${receiptId}`);
  command = (await transitionCoreCommand(command.id, task.blockedReason === 'provider_configuration_required' ? 'setup_required' : 'approval_pending', {
    summary: task.result?.summary || `Task ${task.id} stopped at ${task.blockedReason || 'a governed boundary'}.`,
    links: {
      taskIds: [task.id],
      executionIds: receipt.links.executionIds,
      receiptIds: [receipt.id],
      trustDomains: [receipt.trustDomain],
    },
  })).command;
  return { command, contextBundle: started.contextBundle, task, workOrder, receipt };
}

export async function assertArtifactContent(workspaceRoot: string, relativePath: string, expectedContent: string) {
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(path.resolve(workspaceRoot), absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Evidence artifact escaped workspace: ${relativePath}`);
  const content = await fs.readFile(absolutePath, 'utf8');
  if (content !== expectedContent) throw new Error(`Evidence artifact content mismatch for ${relativePath}`);
  return absolutePath;
}

export function approvedStep(scope: ExecutionPlanStepApproval['scope'], reviewer = 'user'): ExecutionPlanStepApproval {
  return {
    required: true,
    status: 'approved',
    approver: reviewer,
    approvedAt: new Date().toISOString(),
    note: `Explicitly approved ${scope} for this isolated Alpha evidence scenario.`,
    scope,
  };
}
