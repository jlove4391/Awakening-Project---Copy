import type { ExecutionStatus } from '../executions.js';
import type { CanonicalReceipt } from '../receipts.js';
import type { PolicyDecision } from './policyDecision.js';
import { appendTrustEvent, listTrustEvents, type CreateTrustEventInput, type TrustDomain, type TrustEvent, type TrustEventType } from './trustStore.js';

export type AutonomyEnvelopeLevel = 'guarded' | 'supervised' | 'trusted' | 'expanded';

export interface TrustDomainScore {
  domain: TrustDomain;
  score: number;
  autonomyEnvelope: AutonomyEnvelopeLevel;
  successfulActions: number;
  failedActions: number;
  rollbacks: number;
  userCorrections: number;
  validationSuccesses: number;
  validationFailures: number;
  receiptQualityChecks: number;
  boundaryAccuracyChecks: number;
  ordinaryExecutionEvidence: number;
  explicitBoundaryEvents: number;
  totalEvents: number;
  recommendations: string[];
  reasons: string[];
}

const eventWeights: Record<TrustEventType, number> = {
  action_succeeded: 5,
  action_failed: -8,
  rollback_performed: -6,
  user_correction: -7,
  receipt_quality_checked: 2,
  boundary_accuracy_checked: 1,
  validation_succeeded: 3,
  validation_failed: -5,
};

function eventWeight(event: TrustEvent) {
  if (event.type === 'receipt_quality_checked' && event.outcome === 'negative') return -6;
  if (event.type === 'boundary_accuracy_checked' && event.outcome === 'negative') return -5;
  if (event.outcome === 'neutral' && event.type !== 'boundary_accuracy_checked') return 0;
  return eventWeights[event.type];
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function envelopeForScore(score: number): AutonomyEnvelopeLevel {
  if (score >= 85) return 'expanded';
  if (score >= 70) return 'trusted';
  if (score >= 55) return 'supervised';
  return 'guarded';
}

function scoreEvents(domain: TrustDomain, events: TrustEvent[]): TrustDomainScore {
  const score = clamp(50 + events.reduce((total, event) => total + eventWeight(event), 0));
  const successfulActions = events.filter((event) => event.type === 'action_succeeded').length;
  const failedActions = events.filter((event) => event.type === 'action_failed').length;
  const rollbacks = events.filter((event) => event.type === 'rollback_performed').length;
  const userCorrections = events.filter((event) => event.type === 'user_correction').length;
  const validationSuccesses = events.filter((event) => event.type === 'validation_succeeded').length;
  const validationFailures = events.filter((event) => event.type === 'validation_failed').length;
  const receiptQualityChecks = events.filter((event) => event.type === 'receipt_quality_checked').length;
  const boundaryAccuracyChecks = events.filter((event) => event.type === 'boundary_accuracy_checked').length;
  const ordinaryExecutionEvidence = events.filter((event) => event.policyClassification === 'execute_with_receipt' && event.type === 'action_succeeded').length;
  const explicitBoundaryEvents = events.filter((event) => event.policyClassification === 'explicit_boundary').length;
  const autonomyEnvelope = envelopeForScore(score);
  const recommendations: string[] = [];
  const reasons: string[] = [];

  if (successfulActions >= 3 && validationSuccesses >= 3 && receiptQualityChecks >= 3 && failedActions === 0 && validationFailures === 0 && userCorrections === 0) {
    recommendations.push(`Consider expanding ${domain} autonomy after repeated complete, validated receipt evidence.`);
    reasons.push(`${successfulActions} successful action(s), ${validationSuccesses} passed validation check(s), and ${receiptQualityChecks} receipt quality check(s) with no failures or user corrections.`);
  }
  if (failedActions || validationFailures || userCorrections || rollbacks) {
    recommendations.push(`Contract or hold ${domain} autonomy until failures, corrections, or rollback evidence are resolved.`);
    reasons.push(`${failedActions} failure(s), ${validationFailures} validation failure(s), ${userCorrections} correction(s), ${rollbacks} rollback(s).`);
  }
  if (receiptQualityChecks === 0 && successfulActions > 0) {
    recommendations.push(`Hold ${domain} autonomy because successful actions lack canonical receipt quality evidence.`);
  }
  if (validationSuccesses < successfulActions) {
    recommendations.push(`Hold ${domain} autonomy until every successful action is backed by passed validation evidence.`);
  }
  if (explicitBoundaryEvents > 0 && ordinaryExecutionEvidence === 0) {
    recommendations.push(`Keep ${domain} approval boundary intact; explicit-boundary events do not expand execution trust.`);
  }

  return {
    domain,
    score,
    autonomyEnvelope,
    successfulActions,
    failedActions,
    rollbacks,
    userCorrections,
    validationSuccesses,
    validationFailures,
    receiptQualityChecks,
    boundaryAccuracyChecks,
    ordinaryExecutionEvidence,
    explicitBoundaryEvents,
    totalEvents: events.length,
    recommendations,
    reasons,
  };
}

export async function recordTrustEvent(input: CreateTrustEventInput) {
  return appendTrustEvent(input);
}

export async function recordTrustEventFromPolicyDecision(input: {
  decision: PolicyDecision;
  status: ExecutionStatus | 'blocked';
  actor: string;
  action: string;
  executionId?: string;
  receiptId?: string;
  taskId?: string;
  validationPassed?: boolean;
  receiptComplete?: boolean;
  metadata?: Record<string, unknown>;
}) {
  // Legacy callers that do not present a canonical receipt are intentionally ignored.
  // Trust expansion/contraction is now derived from the primary receipt after persistence.
  if (!input.receiptId) return undefined;

  if (input.decision.action === 'execute') {
    const succeeded = input.status === 'completed';
    return appendTrustEvent({
      id: `${input.receiptId}:legacy-policy-outcome`,
      domain: input.decision.trustDomain,
      type: succeeded ? 'action_succeeded' : 'action_failed',
      outcome: succeeded ? 'positive' : 'negative',
      actor: input.actor,
      action: input.action,
      summary: `${input.action} ${succeeded ? 'completed inside' : 'failed inside'} ${input.decision.trustDomain} trust domain.`,
      executionId: input.executionId,
      receiptId: input.receiptId,
      taskId: input.taskId,
      policyClassification: input.decision.policyClassification,
      policyAction: input.decision.action,
      validationPassed: input.validationPassed,
      receiptComplete: input.receiptComplete,
      metadata: input.metadata,
    });
  }

  return appendTrustEvent({
    id: `${input.receiptId}:legacy-policy-boundary`,
    domain: input.decision.trustDomain,
    type: 'boundary_accuracy_checked',
    outcome: 'neutral',
    actor: input.actor,
    action: input.action,
    summary: `${input.action} preserved ${input.decision.action} policy behavior.`,
    executionId: input.executionId,
    receiptId: input.receiptId,
    taskId: input.taskId,
    policyClassification: input.decision.policyClassification,
    policyAction: input.decision.action,
    boundary: input.decision.boundary,
    metadata: input.metadata,
  });
}

function linkedExecutionId(receipt: CanonicalReceipt) {
  return receipt.subject.kind === 'execution' ? receipt.subject.id : receipt.links.executionIds[0];
}

function linkedTaskId(receipt: CanonicalReceipt) {
  return receipt.links.taskIds[0];
}

function receiptEventInput(receipt: CanonicalReceipt, suffix: string): Pick<CreateTrustEventInput, 'id' | 'domain' | 'actor' | 'action' | 'executionId' | 'receiptId' | 'taskId' | 'policyClassification' | 'policyAction' | 'boundary' | 'metadata'> {
  return {
    id: `${receipt.id}:${suffix}`,
    domain: receipt.trustImpact.domain,
    actor: receipt.actor,
    action: receipt.action,
    executionId: linkedExecutionId(receipt),
    receiptId: receipt.id,
    taskId: linkedTaskId(receipt),
    policyClassification: receipt.policy.classification,
    policyAction: receipt.policy.action,
    boundary: receipt.policy.boundary,
    metadata: {
      canonicalReceiptVersion: receipt.version,
      canonicalReceiptSubject: receipt.subject,
      trustRecommendation: receipt.trustImpact.recommendation,
      commandId: receipt.links.commandId,
      contextBundleId: receipt.links.contextBundleId,
    },
  };
}

export async function recordTrustEventsFromCanonicalReceipt(receipt: CanonicalReceipt) {
  const events: TrustEvent[] = [];
  const complete = receipt.integrity.status === 'complete';
  const explicitBoundary = receipt.status === 'blocked' || receipt.status === 'pending_approval' || receipt.policy.classification === 'explicit_boundary';

  if (!complete) {
    events.push(await appendTrustEvent({
      ...receiptEventInput(receipt, 'receipt-quality'),
      type: 'receipt_quality_checked',
      outcome: 'negative',
      summary: `Canonical receipt ${receipt.id} is incomplete and cannot expand trust.`,
      receiptComplete: false,
    }));
    return events;
  }

  if (explicitBoundary) {
    events.push(await appendTrustEvent({
      ...receiptEventInput(receipt, 'boundary'),
      type: 'boundary_accuracy_checked',
      outcome: 'neutral',
      summary: `Canonical receipt ${receipt.id} preserved an explicit approval or policy boundary.`,
      receiptComplete: true,
    }));
    return events;
  }

  if (!receipt.trustImpact.eligible) return events;

  events.push(await appendTrustEvent({
    ...receiptEventInput(receipt, 'receipt-quality'),
    type: 'receipt_quality_checked',
    outcome: 'positive',
    summary: `Canonical receipt ${receipt.id} passed completeness and link-integrity validation.`,
    receiptComplete: true,
  }));

  if (receipt.validation.status === 'passed' || receipt.validation.status === 'not_required') {
    events.push(await appendTrustEvent({
      ...receiptEventInput(receipt, 'validation'),
      type: 'validation_succeeded',
      outcome: 'positive',
      summary: `Canonical receipt ${receipt.id} contains passed or not-required validation evidence.`,
      validationPassed: true,
      receiptComplete: true,
    }));
  } else if (receipt.validation.status === 'failed') {
    events.push(await appendTrustEvent({
      ...receiptEventInput(receipt, 'validation'),
      type: 'validation_failed',
      outcome: 'negative',
      summary: `Canonical receipt ${receipt.id} records failed validation.`,
      validationPassed: false,
      receiptComplete: true,
    }));
  }

  const succeeded = receipt.status === 'completed' && receipt.validation.status !== 'failed';
  events.push(await appendTrustEvent({
    ...receiptEventInput(receipt, 'outcome'),
    type: succeeded ? 'action_succeeded' : 'action_failed',
    outcome: succeeded ? 'positive' : 'negative',
    summary: `${receipt.action} ${succeeded ? 'completed with validated canonical proof' : `finished with ${receipt.status} or failed validation`}.`,
    validationPassed: receipt.validation.status === 'passed' || receipt.validation.status === 'not_required',
    receiptComplete: true,
  }));

  return events;
}

export async function getTrustScore(domain: TrustDomain) {
  return scoreEvents(domain, await listTrustEvents({ domain }));
}

export async function getTrustState() {
  const events = await listTrustEvents();
  const domains = [...new Set(events.map((event) => event.domain))].sort();
  const domainScores = domains.map((domain) => scoreEvents(domain, events.filter((event) => event.domain === domain)));
  const averageScore = domainScores.length ? clamp(domainScores.reduce((total, item) => total + item.score, 0) / domainScores.length) : 50;
  return {
    score: averageScore,
    autonomyEnvelope: envelopeForScore(averageScore),
    domains: domainScores,
    recommendations: domainScores.flatMap((domain) => domain.recommendations),
    eventCount: events.length,
  };
}
