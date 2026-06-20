import type { ExecutionStatus } from '../executions.js';
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
  const score = clamp(50 + events.reduce((total, event) => total + eventWeights[event.type], 0));
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

  if (successfulActions >= 3 && failedActions === 0 && validationFailures === 0 && userCorrections === 0) {
    recommendations.push(`Consider expanding ${domain} autonomy after repeated successful execution evidence.`);
    reasons.push(`${successfulActions} successful action(s) with no failures, validation failures, or user corrections.`);
  }
  if (failedActions || validationFailures || userCorrections || rollbacks) {
    recommendations.push(`Contract or hold ${domain} autonomy until failures/corrections are resolved.`);
    reasons.push(`${failedActions} failure(s), ${validationFailures} validation failure(s), ${userCorrections} correction(s), ${rollbacks} rollback(s).`);
  }
  if (receiptQualityChecks === 0 && successfulActions > 0) {
    recommendations.push(`Add receipt quality checks before expanding ${domain} autonomy further.`);
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
  if (input.decision.action === 'execute') {
    const succeeded = input.status === 'completed';
    return appendTrustEvent({
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

  if (input.decision.action === 'ask_before_execution') {
    return appendTrustEvent({
      domain: input.decision.trustDomain,
      type: 'boundary_accuracy_checked',
      outcome: 'neutral',
      actor: input.actor,
      action: input.action,
      summary: `${input.action} preserved explicit ${input.decision.boundary} boundary.`,
      executionId: input.executionId,
      receiptId: input.receiptId,
      taskId: input.taskId,
      policyClassification: input.decision.policyClassification,
      policyAction: input.decision.action,
      boundary: input.decision.boundary,
      metadata: input.metadata,
    });
  }

  return appendTrustEvent({
    domain: input.decision.trustDomain,
    type: 'boundary_accuracy_checked',
    outcome: 'neutral',
    actor: input.actor,
    action: input.action,
    summary: `${input.action} produced ${input.decision.action} policy decision.`,
    executionId: input.executionId,
    receiptId: input.receiptId,
    taskId: input.taskId,
    policyClassification: input.decision.policyClassification,
    policyAction: input.decision.action,
    metadata: input.metadata,
  });
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
