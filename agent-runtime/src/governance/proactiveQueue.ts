import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { createDelegatedTask } from '../tasks/store.js';
import type { CreateDelegatedTaskInput } from '../tasks/types.js';

export type ProactiveQueueStatus = 'open' | 'approved' | 'deferred' | 'dismissed' | 'completed';
export type ProactiveQueueRisk = 'low' | 'medium' | 'high' | 'critical';
export type ProactiveQueueEffort = 'small' | 'medium' | 'large';
export type ProactiveQueueSource = 'elora' | 'core' | 'nexora' | 'scan' | 'user' | string;

export interface ProactiveQueueReceipt {
  id: string;
  type: 'created' | 'merged' | 'approved' | 'deferred' | 'dismissed' | 'completed' | 'execution_task_created';
  summary: string;
  issuedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ProactiveQueueItem {
  id: string;
  fingerprint: string;
  title: string;
  summary: string;
  source: ProactiveQueueSource;
  affectedArea: string;
  risk: ProactiveQueueRisk;
  estimatedEffort: ProactiveQueueEffort;
  status: ProactiveQueueStatus;
  impact: number;
  confidence: number;
  rank: number;
  duplicateCount: number;
  relatedFingerprints: string[];
  receipts: ProactiveQueueReceipt[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  executionTaskId?: string;
  proposal?: Pick<CreateDelegatedTaskInput, 'objective' | 'constraints' | 'requiredTools' | 'executionPlan'>;
}

export type ProactiveQueueInput = Pick<ProactiveQueueItem, 'title' | 'summary' | 'source' | 'affectedArea' | 'risk' | 'estimatedEffort'> &
  Partial<Pick<ProactiveQueueItem, 'impact' | 'confidence' | 'proposal'>> & { receipts?: Array<Partial<ProactiveQueueReceipt> & { summary: string }> };

const queueDir = path.join(runtimeConfig.dataDir, 'proactive-queue');
const queuePath = path.join(queueDir, 'items.json');
let cache: ProactiveQueueItem[] | undefined;
let writeChain = Promise.resolve();

function now() { return new Date().toISOString(); }
async function ensureStore() { await fs.mkdir(queueDir, { recursive: true }); }
function clampScore(value: unknown, fallback: number) { return Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : fallback)); }
function riskWeight(risk: ProactiveQueueRisk) { return risk === 'critical' ? 1 : risk === 'high' ? 0.8 : risk === 'medium' ? 0.45 : 0.2; }
function canonical(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function fingerprint(input: Pick<ProactiveQueueInput, 'title' | 'summary' | 'affectedArea'>) {
  const key = `${canonical(input.affectedArea)}|${canonical(input.title)}|${canonical(input.summary).slice(0, 160)}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 24);
}
function score(item: Pick<ProactiveQueueItem, 'impact' | 'confidence' | 'risk'>) {
  return Number(((item.impact * 0.45) + (item.confidence * 0.35) + (riskWeight(item.risk) * 0.2)).toFixed(4));
}
function receipt(type: ProactiveQueueReceipt['type'], summary: string, metadata?: Record<string, unknown>): ProactiveQueueReceipt {
  return { id: randomUUID(), type, summary, issuedAt: now(), ...(metadata ? { metadata } : {}) };
}
function normalizeStatus(status: unknown): ProactiveQueueStatus | undefined {
  return ['open', 'approved', 'deferred', 'dismissed', 'completed'].includes(String(status)) ? status as ProactiveQueueStatus : undefined;
}
function rankItems(items: ProactiveQueueItem[]) {
  return [...items].sort((a, b) => b.rank - a.rank || b.updatedAt.localeCompare(a.updatedAt));
}
async function loadItems() {
  if (cache) return cache;
  await ensureStore();
  try { cache = JSON.parse(await fs.readFile(queuePath, 'utf8')) as ProactiveQueueItem[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; cache = []; await persistItems(); }
  return cache;
}
async function persistItems() { await ensureStore(); await fs.writeFile(queuePath, `${JSON.stringify(cache || [], null, 2)}\n`); }
async function serializedWrite<T>(operation: () => Promise<T>) { const next = writeChain.then(operation, operation); writeChain = next.then(() => undefined, () => undefined); return next; }

export async function upsertProactiveQueueItem(input: ProactiveQueueInput) {
  return serializedWrite(async () => {
    const items = await loadItems();
    const fp = fingerprint(input);
    const existing = items.find((item) => item.fingerprint === fp || (canonical(item.title) === canonical(input.title) && canonical(item.affectedArea) === canonical(input.affectedArea)));
    if (existing) {
      existing.summary = input.summary.length > existing.summary.length ? input.summary : existing.summary;
      existing.impact = Math.max(existing.impact, clampScore(input.impact, existing.impact));
      existing.confidence = Math.max(existing.confidence, clampScore(input.confidence, existing.confidence));
      existing.risk = riskWeight(input.risk) > riskWeight(existing.risk) ? input.risk : existing.risk;
      existing.estimatedEffort = input.estimatedEffort;
      existing.duplicateCount += 1;
      existing.rank = score(existing);
      existing.updatedAt = now();
      if (!existing.relatedFingerprints.includes(fp)) existing.relatedFingerprints.push(fp);
      existing.receipts.push(receipt('merged', `Merged repeated proactive finding from ${input.source}.`, { source: input.source }));
      await persistItems();
      return { item: existing, merged: true };
    }
    const createdAt = now();
    const item: ProactiveQueueItem = {
      id: `pq_${randomUUID()}`, fingerprint: fp, title: input.title.trim(), summary: input.summary.trim(), source: input.source,
      affectedArea: input.affectedArea.trim(), risk: input.risk, estimatedEffort: input.estimatedEffort, status: 'open',
      impact: clampScore(input.impact, 0.5), confidence: clampScore(input.confidence, 0.65), rank: 0, duplicateCount: 1, relatedFingerprints: [fp],
      receipts: [receipt('created', `Created proactive queue item from ${input.source}.`), ...(input.receipts || []).map((r) => receipt(r.type || 'created', r.summary, r.metadata))],
      createdAt, updatedAt: createdAt, ...(input.proposal ? { proposal: input.proposal } : {}),
    };
    item.rank = score(item);
    items.unshift(item);
    await persistItems();
    return { item, merged: false };
  });
}

export async function listProactiveQueueItems(options: { status?: ProactiveQueueStatus } = {}) {
  const items = await loadItems();
  const filtered = options.status ? items.filter((item) => item.status === options.status) : items;
  return rankItems(filtered);
}
export async function getProactiveQueueItem(id: string) { return (await loadItems()).find((item) => item.id === id); }
export async function updateProactiveQueueStatus(id: string, status: ProactiveQueueStatus, note?: string) {
  return serializedWrite(async () => {
    const item = (await loadItems()).find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.status = status; item.updatedAt = now();
    item.receipts.push(receipt(status, note || `Queue item marked ${status}.`));
    await persistItems(); return item;
  });
}
export async function approveProactiveQueueItem(id: string, approver = 'user', note = '') {
  return serializedWrite(async () => {
    const item = (await loadItems()).find((candidate) => candidate.id === id);
    if (!item) return undefined;
    item.status = 'approved'; item.approvedAt = now(); item.approvedBy = approver; item.updatedAt = now();
    const task = await createDelegatedTask({ sessionId: 'proactive-queue', objective: item.proposal?.objective || item.title, constraints: item.proposal?.constraints || [item.summary, `Affected area: ${item.affectedArea}`, `Risk: ${item.risk}`], requiredTools: item.proposal?.requiredTools || ['nexora.plan_apply_verify'], executionPlan: item.proposal?.executionPlan, approvalRequirements: [{ required: true, status: 'approved', approver, approvedAt: item.approvedAt, note: note || `Approved proactive queue item ${item.id}` }], authorizationSource: 'user_delegated', executionOrigin: 'delegated' });
    item.executionTaskId = task.id;
    item.receipts.push(receipt('approved', note || `Approved by ${approver}.`, { approver }));
    item.receipts.push(receipt('execution_task_created', `Entered governed execution path as delegated task ${task.id}.`, { taskId: task.id }));
    await persistItems(); return { item, task };
  });
}
export const proactiveQueueStatuses: ProactiveQueueStatus[] = ['open', 'approved', 'deferred', 'dismissed', 'completed'];
export function parseProactiveQueueStatus(value: unknown) { return normalizeStatus(value); }
