import type { CoreContextBundle } from './contextTypes.js';

export interface ActiveCoreExecutionContext {
  sessionId: string;
  commandId: string;
  contextBundleId: string;
  identityIds: string[];
  memoryIds: string[];
  relationshipEntryIds: string[];
  priorCommandIds: string[];
  taskIds: string[];
  executionIds: string[];
  receiptIds: string[];
  trustDomains: string[];
  trustDomain: string;
  trustScore: number;
  autonomyEnvelope: string;
  validationRequirement: string;
  scopeLimit: string;
  authorityBasis: string;
  assembledAt: string;
}

const activeBySession = new Map<string, ActiveCoreExecutionContext>();

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function setActiveCoreExecutionContext(bundle: CoreContextBundle) {
  if (!bundle.commandId) return undefined;
  const active: ActiveCoreExecutionContext = {
    sessionId: bundle.sessionId,
    commandId: bundle.commandId,
    contextBundleId: bundle.id,
    identityIds: unique(bundle.references.identityIds),
    memoryIds: unique(bundle.references.memoryIds),
    relationshipEntryIds: unique(bundle.references.relationshipEntryIds),
    priorCommandIds: unique(bundle.references.commandIds),
    taskIds: unique(bundle.references.taskIds),
    executionIds: unique(bundle.references.executionIds),
    receiptIds: unique(bundle.references.receiptIds),
    trustDomains: unique(bundle.references.trustDomains),
    trustDomain: bundle.executionEnvelope.primaryTrustDomain,
    trustScore: bundle.executionEnvelope.trustScore,
    autonomyEnvelope: bundle.executionEnvelope.autonomyEnvelope,
    validationRequirement: bundle.executionEnvelope.validationRequirement,
    scopeLimit: bundle.executionEnvelope.scopeLimit,
    authorityBasis: [
      `command=${bundle.commandId}`,
      `context=${bundle.id}`,
      `trust_domain=${bundle.executionEnvelope.primaryTrustDomain}`,
      `trust_score=${bundle.executionEnvelope.trustScore}`,
      `autonomy_envelope=${bundle.executionEnvelope.autonomyEnvelope}`,
      `validation=${bundle.executionEnvelope.validationRequirement}`,
      `scope=${bundle.executionEnvelope.scopeLimit}`,
    ].join('; '),
    assembledAt: bundle.assembledAt,
  };
  activeBySession.set(bundle.sessionId, active);
  return active;
}

export function getActiveCoreExecutionContext(sessionId: string | undefined) {
  return sessionId ? activeBySession.get(sessionId) : undefined;
}

export function clearActiveCoreExecutionContext(sessionId: string, commandId?: string) {
  const active = activeBySession.get(sessionId);
  if (!active) return false;
  if (commandId && active.commandId !== commandId) return false;
  return activeBySession.delete(sessionId);
}

export function clearActiveCoreExecutionContextsForTesting() {
  activeBySession.clear();
}
