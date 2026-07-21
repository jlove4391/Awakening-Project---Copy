import { getCanonicalReceipt, upsertCanonicalReceipt, type CanonicalReceipt } from '../receipts.js';
import { appendTrustEvent } from './trustStore.js';

export interface CanonicalReceiptTrustSignalInput {
  receiptId: string;
  signalId: string;
  summary: string;
  actor?: string;
  metadata?: Record<string, unknown>;
}

function linkedExecutionId(receipt: CanonicalReceipt) {
  return receipt.subject.kind === 'execution' ? receipt.subject.id : receipt.links.executionIds[0];
}

function linkedTaskId(receipt: CanonicalReceipt) {
  return receipt.links.taskIds[0];
}

async function requireReceipt(receiptId: string) {
  const receipt = await getCanonicalReceipt(receiptId);
  if (!receipt) throw new Error(`Canonical receipt not found: ${receiptId}`);
  return receipt;
}

async function persistSignalImpact(receipt: CanonicalReceipt, eventId: string, summary: string, kind: 'correction' | 'rollback') {
  return upsertCanonicalReceipt({
    id: receipt.id,
    subject: receipt.subject,
    actor: receipt.actor,
    requestedBy: receipt.requestedBy,
    action: receipt.action,
    summary: receipt.summary,
    status: receipt.status,
    trustDomain: receipt.trustDomain,
    policy: receipt.policy,
    timestamps: receipt.timestamps,
    links: { ...receipt.links, trustEventIds: [...receipt.links.trustEventIds, eventId] },
    evidence: {
      ...receipt.evidence,
      errors: kind === 'correction' ? [...receipt.evidence.errors, summary] : receipt.evidence.errors,
      remainingWork: [...receipt.evidence.remainingWork, `${kind === 'correction' ? 'Correction' : 'Rollback'} follow-through: ${summary}`],
    },
    validation: receipt.validation,
    trustImpact: {
      eligible: false,
      domain: receipt.trustDomain,
      outcome: 'negative',
      recommendation: 'contract',
      reasons: [...receipt.trustImpact.reasons, `${kind === 'correction' ? 'User correction' : 'Rollback'} linked to this receipt: ${summary}`],
    },
  });
}

export async function recordCanonicalReceiptCorrection(input: CanonicalReceiptTrustSignalInput) {
  const receipt = await requireReceipt(input.receiptId);
  const event = await appendTrustEvent({
    id: `${receipt.id}:user-correction:${input.signalId}`,
    domain: receipt.trustDomain,
    type: 'user_correction',
    outcome: 'negative',
    actor: input.actor || 'user',
    action: receipt.action,
    summary: input.summary,
    executionId: linkedExecutionId(receipt),
    receiptId: receipt.id,
    taskId: linkedTaskId(receipt),
    policyClassification: receipt.policy.classification,
    policyAction: receipt.policy.action,
    boundary: receipt.policy.boundary,
    validationPassed: receipt.validation.status === 'passed' || receipt.validation.status === 'not_required',
    receiptComplete: receipt.integrity.status === 'complete',
    metadata: { signalId: input.signalId, canonicalReceiptSubject: receipt.subject, ...input.metadata },
  });
  const updatedReceipt = await persistSignalImpact(receipt, event.id, input.summary, 'correction');
  return { receipt: updatedReceipt, event };
}

export async function recordCanonicalReceiptRollback(input: CanonicalReceiptTrustSignalInput) {
  const receipt = await requireReceipt(input.receiptId);
  const event = await appendTrustEvent({
    id: `${receipt.id}:rollback:${input.signalId}`,
    domain: receipt.trustDomain,
    type: 'rollback_performed',
    outcome: 'negative',
    actor: input.actor || 'system',
    action: receipt.action,
    summary: input.summary,
    executionId: linkedExecutionId(receipt),
    receiptId: receipt.id,
    taskId: linkedTaskId(receipt),
    policyClassification: receipt.policy.classification,
    policyAction: receipt.policy.action,
    boundary: receipt.policy.boundary,
    validationPassed: receipt.validation.status === 'passed' || receipt.validation.status === 'not_required',
    receiptComplete: receipt.integrity.status === 'complete',
    rollbackPerformed: true,
    metadata: { signalId: input.signalId, canonicalReceiptSubject: receipt.subject, ...input.metadata },
  });
  const updatedReceipt = await persistSignalImpact(receipt, event.id, input.summary, 'rollback');
  return { receipt: updatedReceipt, event };
}
