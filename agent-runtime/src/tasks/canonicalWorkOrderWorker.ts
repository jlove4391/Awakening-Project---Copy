import { listExecutionRecords } from '../executions.js';
import { canonicalReceiptId, upsertCanonicalReceipt, type CanonicalReceiptStatus, type CanonicalReceiptValidationStatus } from '../receipts.js';
import type { DelegatedTaskHandler } from './queue.js';
import { nexoraWorkOrderExecutionWorker } from './nexoraWorkOrderWorker.js';
import { appendDelegatedTaskEvent, getDelegatedTask, updateDelegatedTask } from './store.js';
import type { ApprovalScope, DelegatedTask } from './types.js';
import { createNexoraWorkOrderForTask, getNexoraWorkOrderByTaskId, patchNexoraWorkOrder, type NexoraWorkOrder, type NexoraWorkOrderValidationStatus } from './workOrders.js';

const hardApprovalScopes = new Set<ApprovalScope>([
  'repo.commit',
  'repo.delete',
  'provider.create',
  'provider.update',
  'provider.delete',
  'database.migrate',
  'external.send',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function unique(values: Array<string | undefined> = []) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function hardBoundaryScope(task: DelegatedTask) {
  const scopes = [
    task.pendingToolAction?.approvalScope,
    ...(task.executionPlan || []).map((step) => step.approval?.scope),
  ];
  return scopes.find((scope): scope is ApprovalScope => Boolean(scope && hardApprovalScopes.has(scope)));
}

function receiptStatus(task: DelegatedTask, order: NexoraWorkOrder): CanonicalReceiptStatus {
  if (task.status === 'pending_approval') return 'pending_approval';
  if (task.status === 'blocked' || order.state === 'blocked') return 'blocked';
  if (task.status === 'cancelled' || order.state === 'cancelled') return 'cancelled';
  if (task.status === 'failed' || order.state === 'failed') return 'failed';
  if (task.status === 'completed' || order.state === 'completed') return 'completed';
  if (order.state === 'draft' || order.state === 'ready' || order.state === 'queued') return 'requested';
  return 'running';
}

function canonicalValidationStatus(status: NexoraWorkOrderValidationStatus): CanonicalReceiptValidationStatus {
  if (status === 'skipped') return 'not_required';
  return status;
}

function validationStatus(task: DelegatedTask, order: NexoraWorkOrder): CanonicalReceiptValidationStatus {
  if (task.status === 'completed' || order.state === 'completed') return order.validationPlan.every((check) => !check.required || check.status === 'passed') ? 'passed' : 'failed';
  if (task.status === 'failed' || task.status === 'cancelled' || order.state === 'failed' || order.state === 'cancelled') return 'failed';
  return 'pending';
}

function trustDomain(order: NexoraWorkOrder) {
  if (order.evidence.commandsRun.length) return 'commands';
  if (order.evidence.artifactsChanged.length) return 'repository';
  return 'work_orders';
}

function resultData(task: NonNullable<Awaited<ReturnType<typeof getDelegatedTask>>>) {
  return isRecord(task.result?.data) ? { ...task.result.data } : {};
}

function approvalSummary(task: DelegatedTask, order: NexoraWorkOrder) {
  const step = task.executionPlan?.find((candidate) => candidate.approvalStatus === 'pending');
  if (step) return `Nexora work order ${order.id} is awaiting explicit approval for ${step.targetTool}.`;
  return `Nexora work order ${order.id} is awaiting explicit approval.`;
}

export async function publishCanonicalWorkOrderReceipt(taskId: string) {
  const task = await getDelegatedTask(taskId);
  if (!task || task.assignedAgent !== 'nexora') return undefined;
  const order = (await getNexoraWorkOrderByTaskId(taskId)) || await createNexoraWorkOrderForTask(task);

  const executions = (await listExecutionRecords({ sessionId: task.sessionId, limit: 100 }))
    .filter((execution) => execution.linkedIds.taskIds?.includes(task.id));
  const primaryReceiptId = canonicalReceiptId('work_order', order.id);
  const supportingReceiptIds = unique([
    order.receiptId,
    task.receipt?.id,
    task.specialistCall.receipt_id,
    ...order.evidence.receiptIds,
    ...executions.map((execution) => execution.receipt.primaryReceiptId || execution.receipt.alpha?.receipt_id),
  ]).filter((receiptId) => receiptId !== primaryReceiptId);
  const status = receiptStatus(task, order);
  const validation = validationStatus(task, order);
  const approvalScope = hardBoundaryScope(task) || task.pendingToolAction?.approvalScope;
  const explicitBoundary = status === 'pending_approval' || status === 'blocked' || Boolean(approvalScope && hardApprovalScopes.has(approvalScope));
  const approvedBoundary = Boolean(approvalScope && task.executionPlan?.some((step) => step.approval?.scope === approvalScope && step.approvalStatus === 'approved'));
  const resultSummary = task.result?.summary
    || (status === 'pending_approval' ? approvalSummary(task, order) : undefined)
    || order.stateHistory.at(-1)?.summary
    || `Nexora work order ${order.id} is ${order.state}.`;
  const errors = unique([
    ...order.evidence.errors,
    ...(task.result?.error?.message ? [task.result.error.message] : []),
  ]);
  const remainingWork = unique([
    ...order.evidence.remainingWork,
    ...(status === 'pending_approval' || status === 'blocked' ? [resultSummary] : []),
  ]);

  const receipt = await upsertCanonicalReceipt({
    id: primaryReceiptId,
    subject: { kind: 'work_order', id: order.id },
    actor: 'nexora',
    requestedBy: task.authorizationSource === 'autonomous' ? 'agent' : 'user',
    action: 'nexora.execute_work_order',
    summary: resultSummary,
    status,
    trustDomain: trustDomain(order),
    policy: {
      action: explicitBoundary ? 'ask_before_execution' : 'execute',
      classification: explicitBoundary ? 'explicit_boundary' : 'execute_with_receipt',
      approvalStatus: explicitBoundary ? (approvedBoundary ? 'approved' : 'pending') : task.approvalRequirements.some((requirement) => requirement.status === 'approved') ? 'approved' : 'not_required',
      approvalScope,
      authorityBasis: task.authorizationSource,
    },
    timestamps: {
      requestedAt: task.createdAt,
      startedAt: order.startedAt || task.startedAt,
      completedAt: order.finishedAt || task.finishedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
    links: {
      sessionId: task.sessionId,
      commandId: order.contextReferences.commandId,
      contextBundleId: order.contextReferences.contextBundleId,
      identityIds: order.contextReferences.identityIds,
      memoryReferenceIds: order.contextReferences.memoryIds,
      memoryCandidateIds: [],
      relationshipEntryIds: order.contextReferences.relationshipEntryIds,
      priorCommandIds: order.contextReferences.commandIds,
      taskIds: unique([task.id, ...order.contextReferences.taskIds]),
      workOrderIds: [order.id],
      executionIds: unique([...order.contextReferences.executionIds, ...executions.map((execution) => execution.id)]),
      supportingReceiptIds,
    },
    evidence: {
      resultSummary,
      toolsUsed: order.evidence.toolsUsed,
      commandsRun: order.evidence.commandsRun,
      artifactsChanged: order.evidence.artifactsChanged,
      errors,
      remainingWork,
      rollbackGuidance: order.rollbackGuidance,
      result: task.result,
    },
    validation: {
      status: validation,
      required: true,
      checks: order.validationPlan.map((check) => ({
        id: check.id,
        status: canonicalValidationStatus(check.status),
        summary: check.resultSummary || check.description,
      })),
    },
  });

  await patchNexoraWorkOrder(task.id, {
    evidence: { receiptIds: unique([receipt.id, ...supportingReceiptIds]) },
  });

  const data = resultData(task);
  const completion = isRecord(data.completion) ? { ...data.completion } : {};
  const workOrder = isRecord(data.workOrder) ? { ...data.workOrder } : {};
  const receiptIds = unique([receipt.id, ...supportingReceiptIds]);
  await updateDelegatedTask(task.id, {
    result: task.result ? {
      ...task.result,
      data: {
        ...data,
        primaryReceiptId: receipt.id,
        receiptIds,
        completion: { ...completion, primaryReceiptId: receipt.id, receiptId: receipt.id, receiptIds },
        workOrder: { ...workOrder, primaryReceiptId: receipt.id, receiptId: receipt.id, receiptIds },
      },
    } : {
      ok: status === 'completed',
      summary: resultSummary,
      data: { primaryReceiptId: receipt.id, receiptIds },
      ...(errors.length ? { error: { message: errors.join('; ') } } : {}),
    },
    event: {
      type: 'task.receipt_created',
      actor: 'system',
      summary: `Primary canonical receipt ${receipt.id} linked to Nexora work order ${order.id}.`,
      details: {
        primaryReceiptId: receipt.id,
        workOrderId: order.id,
        integrity: receipt.integrity,
        trustImpact: receipt.trustImpact,
      },
    },
  });

  await appendDelegatedTaskEvent(task.id, 'task.log', `Canonical receipt ${receipt.id} is the primary proof record for work order ${order.id}.`, {
    actor: 'system',
  });
  return receipt;
}

export const canonicalNexoraWorkOrderWorker: DelegatedTaskHandler = async (task) => {
  const handled = await nexoraWorkOrderExecutionWorker(task);
  if (handled === false) return false;
  await publishCanonicalWorkOrderReceipt(task.id);
  return handled;
};
