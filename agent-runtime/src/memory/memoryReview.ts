import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { canonicalReceiptId, getCanonicalReceipt, upsertCanonicalReceipt } from '../receipts.js';
import { AlphaMemoryStatus, type CreateMemoryInput, type MemoryRecord } from './memoryTypes.js';
import { memoryService } from './memoryService.js';

export type MemoryReviewDecision = 'promote' | 'reject';

export interface MemoryEvidenceLinks {
  commandId?: string;
  contextBundleId?: string;
  receiptId?: string;
  taskIds?: string[];
  workOrderIds?: string[];
  executionIds?: string[];
}

export interface CreateMemoryCandidateFromEvidenceInput extends CreateMemoryInput {
  evidence: MemoryEvidenceLinks;
}

export interface ReviewMemoryCandidateInput {
  candidateId: string;
  decision: MemoryReviewDecision;
  reviewer: string;
  note?: string;
  confirmedByUser: boolean;
}

export interface MemoryReviewRecord {
  id: string;
  candidateId: string;
  canonicalMemoryId?: string;
  decision: MemoryReviewDecision;
  reviewer: string;
  note?: string;
  receiptId: string;
  sourceEvidence: MemoryEvidenceLinks;
  reviewedAt: string;
}

const reviewDir = path.join(runtimeConfig.dataDir, 'memory');
const reviewPath = path.join(reviewDir, 'memory-reviews.json');
let cache: MemoryReviewRecord[] | undefined;
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function unique(values: Array<string | undefined> = []) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

async function ensureStore() {
  await fs.mkdir(reviewDir, { recursive: true });
}

async function loadReviews() {
  if (cache) return cache;
  await ensureStore();
  try {
    cache = JSON.parse(await fs.readFile(reviewPath, 'utf8')) as MemoryReviewRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cache = [];
    await fs.writeFile(reviewPath, '[]\n');
  }
  return cache;
}

async function persistReviews() {
  await ensureStore();
  const temporaryPath = `${reviewPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(cache || [], null, 2)}\n`);
  await fs.rename(temporaryPath, reviewPath);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

function evidenceFromMemory(memory: MemoryRecord): MemoryEvidenceLinks {
  const metadata = memory.metadata || {};
  const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  return {
    ...(typeof metadata.commandId === 'string' ? { commandId: metadata.commandId } : {}),
    ...(typeof metadata.contextBundleId === 'string' ? { contextBundleId: metadata.contextBundleId } : {}),
    ...(typeof metadata.receiptId === 'string' ? { receiptId: metadata.receiptId } : {}),
    taskIds: stringArray(metadata.taskIds),
    workOrderIds: stringArray(metadata.workOrderIds),
    executionIds: stringArray(metadata.executionIds),
  };
}

async function linkCandidateToSourceReceipt(receiptId: string | undefined, candidateId: string) {
  if (!receiptId) return undefined;
  const source = await getCanonicalReceipt(receiptId);
  if (!source) throw new Error(`Source canonical receipt not found for memory candidate: ${receiptId}`);
  return upsertCanonicalReceipt({
    id: source.id,
    subject: source.subject,
    actor: source.actor,
    requestedBy: source.requestedBy,
    action: source.action,
    summary: source.summary,
    status: source.status,
    trustDomain: source.trustDomain,
    policy: source.policy,
    timestamps: source.timestamps,
    links: { ...source.links, memoryCandidateIds: [candidateId] },
    evidence: source.evidence,
    validation: source.validation,
    trustImpact: source.trustImpact,
  });
}

export async function createMemoryCandidateFromEvidence(input: CreateMemoryCandidateFromEvidenceInput) {
  const evidence = input.evidence;
  if (!evidence.commandId && !evidence.receiptId && !(evidence.taskIds || []).length && !(evidence.executionIds || []).length) {
    throw new Error('Memory candidates require command, receipt, task, or execution evidence.');
  }
  const candidate = await memoryService.createMemoryCandidate({
    ...input,
    metadata: {
      ...(input.metadata || {}),
      evidenceBacked: true,
      commandId: evidence.commandId,
      contextBundleId: evidence.contextBundleId,
      receiptId: evidence.receiptId,
      taskIds: unique(evidence.taskIds),
      workOrderIds: unique(evidence.workOrderIds),
      executionIds: unique(evidence.executionIds),
    },
  });
  await linkCandidateToSourceReceipt(evidence.receiptId, candidate.id);
  return candidate;
}

export async function listMemoryCandidates(options: { sessionId?: string; limit?: number } = {}) {
  return memoryService.listMemories({
    sessionId: options.sessionId,
    includeGlobal: true,
    statuses: [AlphaMemoryStatus.Candidate, AlphaMemoryStatus.Disputed],
    reviewNeeded: true,
    limit: options.limit || 50,
  });
}

export async function listMemoryReviews(limit = 50) {
  return (await loadReviews()).slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function reviewMemoryCandidate(input: ReviewMemoryCandidateInput) {
  if (input.confirmedByUser !== true) {
    throw new Error('Explicit user confirmation is required to promote or reject a memory candidate.');
  }
  if (!input.reviewer.trim()) throw new Error('Memory candidate reviewer is required.');

  return serializedWrite(async () => {
    const candidate = await memoryService.getMemoryById(input.candidateId);
    if (!candidate) throw new Error(`Memory candidate not found: ${input.candidateId}`);
    if (![AlphaMemoryStatus.Candidate, AlphaMemoryStatus.Disputed].includes(candidate.status)) {
      throw new Error(`Memory ${candidate.id} is ${candidate.status}, not reviewable candidate state.`);
    }
    if (!candidate.reviewNeeded) throw new Error(`Memory ${candidate.id} is not awaiting review.`);

    const reviewedAt = now();
    const evidence = evidenceFromMemory(candidate);
    const reviewed = input.decision === 'promote'
      ? await memoryService.promoteMemory(candidate.id, {
          actor: { actorId: input.reviewer, actorType: 'user', displayName: input.reviewer },
          metadata: { reviewDecision: input.decision, reviewer: input.reviewer, reviewNote: input.note, reviewedAt },
        })
      : await memoryService.rejectMemory(candidate.id, {
          actor: { actorId: input.reviewer, actorType: 'user', displayName: input.reviewer },
          metadata: { reviewDecision: input.decision, reviewer: input.reviewer, reviewNote: input.note, reviewedAt },
        });
    if (!reviewed) throw new Error(`Memory candidate could not be reviewed: ${candidate.id}`);

    const reviewId = `memory_review_${randomUUID()}`;
    const receiptId = canonicalReceiptId('artifact', reviewId);
    const receipt = await upsertCanonicalReceipt({
      id: receiptId,
      subject: { kind: 'artifact', id: reviewId },
      actor: input.reviewer,
      requestedBy: 'user',
      action: input.decision === 'promote' ? 'memory.promote_candidate' : 'memory.reject_candidate',
      summary: `${input.decision === 'promote' ? 'Promoted' : 'Rejected'} memory candidate ${candidate.id}.`,
      status: 'completed',
      trustDomain: 'memory',
      policy: {
        action: 'ask_before_execution',
        classification: 'explicit_boundary',
        approvalStatus: 'approved',
        authorityBasis: 'explicit_memory_review',
      },
      timestamps: { requestedAt: reviewedAt, completedAt: reviewedAt },
      links: {
        commandId: evidence.commandId,
        contextBundleId: evidence.contextBundleId,
        memoryCandidateIds: [candidate.id],
        memoryReferenceIds: input.decision === 'promote' ? [reviewed.id] : [],
        taskIds: evidence.taskIds || [],
        workOrderIds: evidence.workOrderIds || [],
        executionIds: evidence.executionIds || [],
        supportingReceiptIds: evidence.receiptId ? [evidence.receiptId] : [],
      },
      evidence: {
        resultSummary: `${candidate.title || candidate.category} candidate was ${input.decision === 'promote' ? 'promoted to canonical memory' : 'rejected and kept non-governing'}.`,
        toolsUsed: [],
        artifactsChanged: [`memory:${candidate.id}`],
        rollbackGuidance: input.decision === 'promote'
          ? 'Deprecate or dispute the promoted memory through a new explicit review; do not silently overwrite it.'
          : 'Reopen the candidate by creating a new evidence-backed candidate and review it explicitly.',
      },
      validation: {
        status: 'passed',
        required: true,
        checks: [{ id: 'memory-review-state', status: 'passed', summary: `Memory status is ${reviewed.status} and reviewNeeded is ${reviewed.reviewNeeded}.` }],
      },
    });

    const review: MemoryReviewRecord = {
      id: reviewId,
      candidateId: candidate.id,
      ...(input.decision === 'promote' ? { canonicalMemoryId: reviewed.id } : {}),
      decision: input.decision,
      reviewer: input.reviewer,
      ...(input.note ? { note: input.note } : {}),
      receiptId: receipt.id,
      sourceEvidence: evidence,
      reviewedAt,
    };
    const reviews = await loadReviews();
    reviews.unshift(review);
    cache = reviews;
    await persistReviews();
    return { candidate: reviewed, review, receipt };
  });
}

export async function clearMemoryReviewsForTesting() {
  return serializedWrite(async () => {
    cache = [];
    await fs.rm(reviewPath, { force: true });
    await ensureStore();
    await fs.writeFile(reviewPath, '[]\n');
  });
}
