import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from './config.js';
import type { PolicyBoundary, PolicyDecision } from './governance/policyDecision.js';
import { recordTrustEventsFromCanonicalReceipt } from './governance/trustService.js';
import type { ApprovalScope } from './tasks/types.js';

export const canonicalReceiptVersion = '1.0' as const;

export type CanonicalReceiptSubjectKind = 'execution' | 'work_order' | 'command' | 'artifact';
export type CanonicalReceiptStatus = 'requested' | 'running' | 'pending_approval' | 'blocked' | 'completed' | 'failed' | 'cancelled';
export type CanonicalReceiptValidationStatus = 'not_required' | 'pending' | 'passed' | 'failed';
export type CanonicalReceiptIntegrityStatus = 'complete' | 'incomplete';
export type CanonicalReceiptTrustOutcome = 'positive' | 'negative' | 'neutral' | 'none';
export type CanonicalReceiptTrustRecommendation = 'expand' | 'hold' | 'contract' | 'none';

export interface CanonicalReceiptLinks {
  sessionId?: string;
  commandId?: string;
  contextBundleId?: string;
  identityIds: string[];
  memoryReferenceIds: string[];
  memoryCandidateIds: string[];
  relationshipEntryIds: string[];
  priorCommandIds: string[];
  taskIds: string[];
  workOrderIds: string[];
  executionIds: string[];
  supportingReceiptIds: string[];
  trustEventIds: string[];
}

export interface CanonicalReceiptEvidence {
  resultSummary: string;
  toolsUsed: string[];
  commandsRun: string[];
  artifactsChanged: string[];
  errors: string[];
  remainingWork: string[];
  rollbackGuidance: string;
  result?: unknown;
}

export interface CanonicalReceiptValidation {
  status: CanonicalReceiptValidationStatus;
  required: boolean;
  checks: Array<{ id: string; status: CanonicalReceiptValidationStatus; summary: string }>;
}

export interface CanonicalReceiptIntegrity {
  status: CanonicalReceiptIntegrityStatus;
  missingFields: string[];
  invalidLinks: string[];
}

export interface CanonicalReceiptTrustImpact {
  eligible: boolean;
  domain: string;
  outcome: CanonicalReceiptTrustOutcome;
  recommendation: CanonicalReceiptTrustRecommendation;
  reasons: string[];
}

export interface CanonicalReceipt {
  id: string;
  version: typeof canonicalReceiptVersion;
  primary: true;
  subject: {
    kind: CanonicalReceiptSubjectKind;
    id: string;
  };
  actor: string;
  requestedBy: string;
  action: string;
  summary: string;
  status: CanonicalReceiptStatus;
  trustDomain: string;
  policy: {
    action?: PolicyDecision['action'];
    classification?: PolicyDecision['policyClassification'];
    boundary?: PolicyBoundary;
    approvalStatus?: string;
    approvalScope?: ApprovalScope;
    authorityBasis: string;
  };
  timestamps: {
    requestedAt: string;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  links: CanonicalReceiptLinks;
  evidence: CanonicalReceiptEvidence;
  validation: CanonicalReceiptValidation;
  integrity: CanonicalReceiptIntegrity;
  trustImpact: CanonicalReceiptTrustImpact;
}

export interface CanonicalReceiptInput {
  id?: string;
  subject: CanonicalReceipt['subject'];
  actor: string;
  requestedBy: string;
  action: string;
  summary: string;
  status: CanonicalReceiptStatus;
  trustDomain?: string;
  policy?: Partial<CanonicalReceipt['policy']>;
  timestamps?: Partial<CanonicalReceipt['timestamps']>;
  links?: Partial<CanonicalReceiptLinks>;
  evidence?: Partial<CanonicalReceiptEvidence>;
  validation?: Partial<CanonicalReceiptValidation>;
  trustImpact?: Partial<CanonicalReceiptTrustImpact>;
}

const receiptDir = path.join(runtimeConfig.dataDir, 'receipts');
const receiptPath = path.join(receiptDir, 'canonical-receipts.json');
const receiptAuditPath = path.join(receiptDir, 'canonical-receipt-audit.jsonl');
let cache: CanonicalReceipt[] | undefined;
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function unique(values: Array<string | undefined> = []) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function links(input: Partial<CanonicalReceiptLinks> = {}, existing?: CanonicalReceiptLinks): CanonicalReceiptLinks {
  return {
    sessionId: input.sessionId || existing?.sessionId,
    commandId: input.commandId || existing?.commandId,
    contextBundleId: input.contextBundleId || existing?.contextBundleId,
    identityIds: unique([...(existing?.identityIds || []), ...(input.identityIds || [])]),
    memoryReferenceIds: unique([...(existing?.memoryReferenceIds || []), ...(input.memoryReferenceIds || [])]),
    memoryCandidateIds: unique([...(existing?.memoryCandidateIds || []), ...(input.memoryCandidateIds || [])]),
    relationshipEntryIds: unique([...(existing?.relationshipEntryIds || []), ...(input.relationshipEntryIds || [])]),
    priorCommandIds: unique([...(existing?.priorCommandIds || []), ...(input.priorCommandIds || [])]),
    taskIds: unique([...(existing?.taskIds || []), ...(input.taskIds || [])]),
    workOrderIds: unique([...(existing?.workOrderIds || []), ...(input.workOrderIds || [])]),
    executionIds: unique([...(existing?.executionIds || []), ...(input.executionIds || [])]),
    supportingReceiptIds: unique([...(existing?.supportingReceiptIds || []), ...(input.supportingReceiptIds || [])]),
    trustEventIds: unique([...(existing?.trustEventIds || []), ...(input.trustEventIds || [])]),
  };
}

function evidence(input: Partial<CanonicalReceiptEvidence> = {}, existing?: CanonicalReceiptEvidence): CanonicalReceiptEvidence {
  return {
    resultSummary: input.resultSummary ?? existing?.resultSummary ?? '',
    toolsUsed: unique([...(existing?.toolsUsed || []), ...(input.toolsUsed || [])]),
    commandsRun: unique([...(existing?.commandsRun || []), ...(input.commandsRun || [])]),
    artifactsChanged: unique([...(existing?.artifactsChanged || []), ...(input.artifactsChanged || [])]),
    errors: unique([...(existing?.errors || []), ...(input.errors || [])]),
    remainingWork: unique([...(existing?.remainingWork || []), ...(input.remainingWork || [])]),
    rollbackGuidance: input.rollbackGuidance ?? existing?.rollbackGuidance ?? '',
    ...(input.result !== undefined ? { result: input.result } : existing?.result !== undefined ? { result: existing.result } : {}),
  };
}

function validation(input: Partial<CanonicalReceiptValidation> = {}, existing?: CanonicalReceiptValidation): CanonicalReceiptValidation {
  const status = input.status || existing?.status || 'pending';
  return {
    status,
    required: input.required ?? existing?.required ?? status !== 'not_required',
    checks: input.checks || existing?.checks || [],
  };
}

export function canonicalReceiptId(kind: CanonicalReceiptSubjectKind, sourceId: string) {
  const digest = createHash('sha256').update(`${kind}:${sourceId}`).digest('hex').slice(0, 24);
  return `core_receipt_${kind}_${digest}`;
}

export function validateCanonicalReceipt(receipt: Partial<CanonicalReceipt> | undefined): CanonicalReceiptIntegrity {
  const missingFields: string[] = [];
  const invalidLinks: string[] = [];
  const requireText = (pathName: string, value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) missingFields.push(pathName);
  };

  requireText('id', receipt?.id);
  requireText('version', receipt?.version);
  requireText('subject.kind', receipt?.subject?.kind);
  requireText('subject.id', receipt?.subject?.id);
  requireText('actor', receipt?.actor);
  requireText('requestedBy', receipt?.requestedBy);
  requireText('action', receipt?.action);
  requireText('summary', receipt?.summary);
  requireText('status', receipt?.status);
  requireText('trustDomain', receipt?.trustDomain);
  requireText('policy.authorityBasis', receipt?.policy?.authorityBasis);
  requireText('timestamps.requestedAt', receipt?.timestamps?.requestedAt);
  requireText('timestamps.createdAt', receipt?.timestamps?.createdAt);
  requireText('timestamps.updatedAt', receipt?.timestamps?.updatedAt);
  requireText('evidence.resultSummary', receipt?.evidence?.resultSummary);
  requireText('evidence.rollbackGuidance', receipt?.evidence?.rollbackGuidance);
  requireText('validation.status', receipt?.validation?.status);

  if (receipt?.primary !== true) missingFields.push('primary');
  if (receipt?.version && receipt.version !== canonicalReceiptVersion) invalidLinks.push(`unsupported receipt version ${receipt.version}`);
  if (receipt?.links?.supportingReceiptIds?.includes(receipt.id || '')) invalidLinks.push('supportingReceiptIds must not include the primary receipt itself');
  if (receipt?.subject?.kind === 'execution' && !receipt.links?.executionIds?.includes(receipt.subject.id)) {
    invalidLinks.push('execution receipts must link their subject execution ID');
  }
  if (receipt?.subject?.kind === 'work_order') {
    if (!receipt.links?.workOrderIds?.includes(receipt.subject.id)) invalidLinks.push('work-order receipts must link their subject work-order ID');
    if (!receipt.links?.taskIds?.length) invalidLinks.push('work-order receipts must link the delegated task ID');
  }
  if (['completed', 'failed', 'cancelled'].includes(receipt?.status || '') && !receipt?.timestamps?.completedAt) {
    missingFields.push('timestamps.completedAt');
  }
  if (receipt?.status === 'completed' && receipt.validation?.status !== 'passed' && receipt.validation?.status !== 'not_required') {
    invalidLinks.push('completed receipts require passed or not-required validation');
  }
  if (receipt?.status === 'failed' && !receipt.evidence?.errors?.length && receipt.validation?.status !== 'failed') {
    missingFields.push('evidence.errors');
  }

  return {
    status: missingFields.length || invalidLinks.length ? 'incomplete' : 'complete',
    missingFields: unique(missingFields),
    invalidLinks: unique(invalidLinks),
  };
}

function trustImpact(receipt: Omit<CanonicalReceipt, 'integrity' | 'trustImpact'>, integrity: CanonicalReceiptIntegrity, override: Partial<CanonicalReceiptTrustImpact> = {}): CanonicalReceiptTrustImpact {
  const explicitBoundaryOnly = receipt.status === 'blocked' || receipt.status === 'pending_approval' || receipt.policy.classification === 'explicit_boundary';
  const terminal = ['completed', 'failed', 'cancelled'].includes(receipt.status);
  const validationResolved = receipt.validation.status === 'passed' || receipt.validation.status === 'failed' || receipt.validation.status === 'not_required';
  const defaultEligible = terminal && validationResolved && integrity.status === 'complete' && !explicitBoundaryOnly;
  const eligible = override.eligible ?? defaultEligible;
  const outcome: CanonicalReceiptTrustOutcome = override.outcome
    || (!eligible ? (explicitBoundaryOnly ? 'neutral' : 'none')
      : receipt.status === 'completed' && receipt.validation.status !== 'failed' ? 'positive' : 'negative');
  const recommendation: CanonicalReceiptTrustRecommendation = override.recommendation
    || (outcome === 'positive' ? 'expand' : outcome === 'negative' ? 'contract' : explicitBoundaryOnly ? 'hold' : 'none');
  const reasons = unique([
    ...(override.reasons || []),
    integrity.status !== 'complete' ? 'Receipt completeness or link integrity did not pass.' : undefined,
    explicitBoundaryOnly ? 'Approval-only or blocked boundary evidence cannot expand autonomy.' : undefined,
    receipt.validation.status === 'failed' ? 'Required validation failed.' : undefined,
    receipt.status === 'failed' || receipt.status === 'cancelled' ? `Receipt finished with ${receipt.status} status.` : undefined,
    eligible && outcome === 'positive' ? 'Completed action has complete receipt evidence and passed validation.' : undefined,
  ]);
  return {
    eligible,
    domain: override.domain || receipt.trustDomain,
    outcome,
    recommendation,
    reasons,
  };
}

function normalizeReceipt(input: CanonicalReceiptInput, existing?: CanonicalReceipt): CanonicalReceipt {
  const timestamp = now();
  const id = input.id || existing?.id || canonicalReceiptId(input.subject.kind, input.subject.id);
  const status = input.status || existing?.status || 'requested';
  const nextLinks = links(input.links, existing?.links);
  nextLinks.supportingReceiptIds = nextLinks.supportingReceiptIds.filter((receiptId) => receiptId !== id);
  const nextEvidence = evidence(input.evidence, existing?.evidence);
  const nextValidation = validation(input.validation, existing?.validation);
  const requestedAt = input.timestamps?.requestedAt || existing?.timestamps.requestedAt || timestamp;
  const completedAt = input.timestamps?.completedAt || existing?.timestamps.completedAt || (['completed', 'failed', 'cancelled'].includes(status) ? timestamp : undefined);
  const base = {
    id,
    version: canonicalReceiptVersion,
    primary: true as const,
    subject: input.subject,
    actor: input.actor || existing?.actor || 'system',
    requestedBy: input.requestedBy || existing?.requestedBy || 'unknown',
    action: input.action || existing?.action || input.subject.kind,
    summary: input.summary || existing?.summary || `${input.subject.kind} ${status}`,
    status,
    trustDomain: input.trustDomain || existing?.trustDomain || 'runtime',
    policy: {
      action: input.policy?.action || existing?.policy.action,
      classification: input.policy?.classification || existing?.policy.classification,
      boundary: input.policy?.boundary || existing?.policy.boundary,
      approvalStatus: input.policy?.approvalStatus || existing?.policy.approvalStatus,
      approvalScope: input.policy?.approvalScope || existing?.policy.approvalScope,
      authorityBasis: input.policy?.authorityBasis || existing?.policy.authorityBasis || 'runtime_policy',
    },
    timestamps: {
      requestedAt,
      startedAt: input.timestamps?.startedAt || existing?.timestamps.startedAt,
      completedAt,
      createdAt: existing?.timestamps.createdAt || input.timestamps?.createdAt || timestamp,
      updatedAt: input.timestamps?.updatedAt || timestamp,
    },
    links: nextLinks,
    evidence: nextEvidence,
    validation: nextValidation,
  } satisfies Omit<CanonicalReceipt, 'integrity' | 'trustImpact'>;
  const integrity = validateCanonicalReceipt({ ...base, integrity: undefined, trustImpact: undefined } as Partial<CanonicalReceipt>);
  return {
    ...base,
    integrity,
    trustImpact: trustImpact(base, integrity, input.trustImpact),
  };
}

async function ensureStore() {
  await fs.mkdir(receiptDir, { recursive: true });
}

async function loadReceipts() {
  if (cache) return cache;
  await ensureStore();
  try {
    cache = JSON.parse(await fs.readFile(receiptPath, 'utf8')) as CanonicalReceipt[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cache = [];
    await fs.writeFile(receiptPath, '[]\n');
  }
  return cache;
}

async function persistReceipts() {
  await ensureStore();
  await fs.writeFile(receiptPath, `${JSON.stringify(cache || [], null, 2)}\n`);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function upsertCanonicalReceipt(input: CanonicalReceiptInput) {
  const receipt = await serializedWrite(async () => {
    const receipts = await loadReceipts();
    const id = input.id || canonicalReceiptId(input.subject.kind, input.subject.id);
    const index = receipts.findIndex((candidate) => candidate.id === id);
    const normalized = normalizeReceipt({ ...input, id }, index >= 0 ? receipts[index] : undefined);
    if (index >= 0) receipts[index] = normalized;
    else receipts.unshift(normalized);
    cache = receipts;
    await persistReceipts();
    await fs.appendFile(receiptAuditPath, `${JSON.stringify({ receiptId: normalized.id, subject: normalized.subject, status: normalized.status, integrity: normalized.integrity, occurredAt: normalized.timestamps.updatedAt })}\n`);
    return normalized;
  });

  const trustEvents = await recordTrustEventsFromCanonicalReceipt(receipt);
  if (trustEvents.length) {
    return serializedWrite(async () => {
      const receipts = await loadReceipts();
      const stored = receipts.find((candidate) => candidate.id === receipt.id);
      if (!stored) return receipt;
      stored.links.trustEventIds = unique([...stored.links.trustEventIds, ...trustEvents.map((event) => event.id)]);
      stored.timestamps.updatedAt = now();
      await persistReceipts();
      return stored;
    });
  }
  return receipt;
}

export async function getCanonicalReceipt(receiptId: string) {
  return (await loadReceipts()).find((receipt) => receipt.id === receiptId);
}

export async function listCanonicalReceipts(options: { sessionId?: string; subjectKind?: CanonicalReceiptSubjectKind; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(options.limit || 25, 100));
  return (await loadReceipts())
    .filter((receipt) => !options.sessionId || receipt.links.sessionId === options.sessionId)
    .filter((receipt) => !options.subjectKind || receipt.subject.kind === options.subjectKind)
    .sort((left, right) => right.timestamps.updatedAt.localeCompare(left.timestamps.updatedAt))
    .slice(0, limit);
}

export async function clearCanonicalReceiptsForTesting() {
  return serializedWrite(async () => {
    cache = [];
    await fs.rm(receiptDir, { recursive: true, force: true });
    await ensureStore();
    await fs.writeFile(receiptPath, '[]\n');
  });
}
