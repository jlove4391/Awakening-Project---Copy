import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import type { PolicyBoundary, PolicyDecision } from './policyDecision.js';

export type TrustDomain =
  | 'repository'
  | 'commands'
  | 'drive'
  | 'calendar'
  | 'gmail'
  | 'memory'
  | 'work_orders'
  | 'workflows'
  | 'self_improvement'
  | 'databanks'
  | 'infrastructure'
  | 'runtime'
  | string;

export type TrustEventType =
  | 'action_succeeded'
  | 'action_failed'
  | 'rollback_performed'
  | 'user_correction'
  | 'receipt_quality_checked'
  | 'boundary_accuracy_checked'
  | 'validation_succeeded'
  | 'validation_failed';

export type TrustEventOutcome = 'positive' | 'negative' | 'neutral';

export interface TrustEvent {
  id: string;
  occurredAt: string;
  domain: TrustDomain;
  type: TrustEventType;
  outcome: TrustEventOutcome;
  actor: string;
  action: string;
  summary: string;
  executionId?: string;
  receiptId?: string;
  taskId?: string;
  policyClassification?: PolicyDecision['policyClassification'];
  policyAction?: PolicyDecision['action'];
  boundary?: PolicyBoundary;
  validationPassed?: boolean;
  receiptComplete?: boolean;
  rollbackPerformed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateTrustEventInput extends Omit<TrustEvent, 'id' | 'occurredAt'> {
  id?: string;
  occurredAt?: string;
}

const trustDir = path.join(runtimeConfig.dataDir, 'trust');
const trustEventsPath = path.join(trustDir, 'trust-events.json');
let cache: TrustEvent[] | undefined;
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(trustDir, { recursive: true });
}

async function persist(events: TrustEvent[]) {
  await ensureStore();
  await fs.writeFile(trustEventsPath, `${JSON.stringify(events, null, 2)}\n`);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

export async function listTrustEvents(filter: { domain?: TrustDomain; limit?: number } = {}) {
  if (!cache) {
    await ensureStore();
    try {
      cache = JSON.parse(await fs.readFile(trustEventsPath, 'utf8')) as TrustEvent[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      cache = [];
      await persist(cache);
    }
  }
  const filtered = filter.domain ? cache.filter((event) => event.domain === filter.domain) : cache;
  const sorted = [...filtered].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return typeof filter.limit === 'number' ? sorted.slice(0, Math.max(0, filter.limit)) : sorted;
}

export async function getTrustEvent(eventId: string) {
  return (await listTrustEvents()).find((event) => event.id === eventId);
}

export async function appendTrustEvent(input: CreateTrustEventInput) {
  return serializedWrite(async () => {
    const events = await listTrustEvents();
    if (input.id) {
      const existing = events.find((event) => event.id === input.id);
      if (existing) return existing;
    }
    const event: TrustEvent = {
      id: input.id || `trust_${randomUUID()}`,
      occurredAt: input.occurredAt || now(),
      domain: input.domain,
      type: input.type,
      outcome: input.outcome,
      actor: input.actor,
      action: input.action,
      summary: input.summary,
      ...(input.executionId ? { executionId: input.executionId } : {}),
      ...(input.receiptId ? { receiptId: input.receiptId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...(input.policyClassification ? { policyClassification: input.policyClassification } : {}),
      ...(input.policyAction ? { policyAction: input.policyAction } : {}),
      ...(input.boundary ? { boundary: input.boundary } : {}),
      ...(typeof input.validationPassed === 'boolean' ? { validationPassed: input.validationPassed } : {}),
      ...(typeof input.receiptComplete === 'boolean' ? { receiptComplete: input.receiptComplete } : {}),
      ...(input.rollbackPerformed ? { rollbackPerformed: true } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    cache = [...events, event];
    await persist(cache);
    return event;
  });
}

export async function clearTrustEventsForTesting() {
  return serializedWrite(async () => {
    cache = [];
    await persist(cache);
  });
}
