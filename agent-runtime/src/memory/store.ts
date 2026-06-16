import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import type { MemoryReference, MemoryScope } from '../types.js';
import type { MemoryActorIdentity, MemoryCategory, TchaiMemoryMetadata } from './memoryTypes.js';

export const durableMemoryScopes = [
  'user_profile',
  'business_context',
  'contacts',
  'leads',
  'preferences',
  'agent_lessons',
  'task_history',
  'conversation_summary',
] as const satisfies readonly MemoryScope[];

const legacyScopeMap: Record<string, MemoryScope> = {
  user: 'user_profile',
  project: 'business_context',
  session: 'conversation_summary',
};

export interface StoredMemory extends MemoryReference {
  sessionId: string;
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  category?: MemoryCategory;
  title?: string;
  summary?: string;
  updatedAt: string;
  metadata: TchaiMemoryMetadata;
  importance: number;
  source: 'agent' | 'user' | 'system' | 'api' | 'voice' | 'migration';
}

interface MemoryDatabase {
  version: 1;
  memories: StoredMemory[];
}

export interface MemoryWriteInput {
  id?: string;
  sessionId: string;
  text: string;
  scope: MemoryScope | string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  importance?: number;
  source?: StoredMemory['source'];
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  category?: MemoryCategory;
  type?: MemoryCategory;
  title?: string;
  summary?: string;
  actor?: MemoryActorIdentity;
  createdAt?: string;
}

export interface MemoryListFilter {
  sessionId?: string;
  scopes?: Array<MemoryScope | string>;
  tags?: string[];
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  categories?: MemoryCategory[];
  types?: MemoryCategory[];
  includeGlobal?: boolean;
  limit?: number;
}

const memoryDir = path.join(runtimeConfig.dataDir, 'memory');
const memoryDbPath = path.join(memoryDir, 'memory-store.json');
let cachedDb: MemoryDatabase | undefined;
let writeQueue: Promise<unknown> = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function emptyDb(): MemoryDatabase {
  return { version: 1, memories: [] };
}

function clampImportance(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function cleanTags(tags: string[] | undefined) {
  return [...new Set((tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function normalizeMemoryScope(scope: MemoryScope | string | undefined): MemoryScope {
  const raw = String(scope || 'conversation_summary').trim();
  const mapped = legacyScopeMap[raw] || raw;
  if ((durableMemoryScopes as readonly string[]).includes(mapped)) return mapped as MemoryScope;
  throw new Error(`Unsupported memory scope "${raw}". Supported scopes: ${durableMemoryScopes.join(', ')}`);
}

function normalizeMemory(input: MemoryWriteInput, existing?: StoredMemory): StoredMemory {
  const timestamp = now();
  const text = input.text.trim();
  if (!text) throw new Error('memory text is required');
  return {
    id: input.id || existing?.id || randomUUID(),
    sessionId: input.sessionId,
    text,
    scope: normalizeMemoryScope(input.scope),
    tags: cleanTags(input.tags ?? existing?.tags),
    createdAt: input.createdAt || existing?.createdAt || timestamp,
    updatedAt: timestamp,
    ownerUserId: input.ownerUserId ?? existing?.ownerUserId ?? (input.metadata?.ownerUserId as string | undefined) ?? (existing?.metadata?.ownerUserId as string | undefined),
    organizationId: input.organizationId ?? existing?.organizationId ?? (input.metadata?.organizationId as string | undefined) ?? (existing?.metadata?.organizationId as string | undefined),
    projectId: input.projectId ?? existing?.projectId ?? (input.metadata?.projectId as string | undefined) ?? (existing?.metadata?.projectId as string | undefined),
    personaId: input.personaId ?? existing?.personaId ?? (input.metadata?.personaId as string | undefined) ?? (existing?.metadata?.personaId as string | undefined),
    category: input.category || input.type || existing?.category || (input.metadata?.category as MemoryCategory | undefined) || (existing?.metadata?.category as MemoryCategory | undefined) || (input.scope === 'conversation_summary' ? 'conversation_summary' : undefined),
    title: input.title ?? existing?.title ?? (input.metadata?.title as string | undefined) ?? (existing?.metadata?.title as string | undefined),
    summary: input.summary ?? existing?.summary ?? (input.metadata?.summary as string | undefined) ?? (existing?.metadata?.summary as string | undefined),
    metadata: {
      ...(existing?.metadata || {}),
      ...(input.metadata || {}),
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.personaId ? { personaId: input.personaId } : {}),
      ...(input.category || input.type ? { category: input.category || input.type } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.actor?.actorId ? { actorId: input.actor.actorId } : {}),
      ...(input.actor?.actorType ? { actorType: input.actor.actorType } : {}),
      ...(input.actor?.displayName ? { actorDisplayName: input.actor.displayName } : {}),
    },
    importance: clampImportance(input.importance ?? existing?.importance),
    source: input.source || existing?.source || 'agent',
  };
}

async function ensureStore() {
  await fs.mkdir(memoryDir, { recursive: true });
}

async function readDb(): Promise<MemoryDatabase> {
  if (cachedDb) return cachedDb;
  await ensureStore();
  try {
    const raw = await fs.readFile(memoryDbPath, 'utf8');
    const parsed = JSON.parse(raw) as MemoryDatabase;
    cachedDb = { version: 1, memories: Array.isArray(parsed.memories) ? parsed.memories : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cachedDb = emptyDb();
    await writeDb(cachedDb);
  }
  return cachedDb;
}

async function writeDb(db: MemoryDatabase) {
  await ensureStore();
  const tmpPath = `${memoryDbPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(db, null, 2)}\n`);
  await fs.rename(tmpPath, memoryDbPath);
  cachedDb = db;
}

async function enqueueWrite<T>(operation: () => Promise<T>) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => undefined);
  return next;
}

function isVisibleToSession(memory: StoredMemory, sessionId: string | undefined, includeGlobal: boolean | undefined) {
  if (!sessionId) return true;
  return memory.sessionId === sessionId || (includeGlobal === true && memory.sessionId === 'global');
}

function matchesFilter(memory: StoredMemory, filter: MemoryListFilter = {}) {
  if (!isVisibleToSession(memory, filter.sessionId, filter.includeGlobal)) return false;
  if (filter.ownerUserId && memory.ownerUserId !== filter.ownerUserId && memory.metadata?.ownerUserId !== filter.ownerUserId) return false;
  if (filter.organizationId && memory.organizationId !== filter.organizationId && memory.metadata?.organizationId !== filter.organizationId) return false;
  if (filter.projectId && memory.projectId !== filter.projectId && memory.metadata?.projectId !== filter.projectId) return false;
  if (filter.personaId && memory.personaId !== filter.personaId && memory.metadata?.personaId !== filter.personaId) return false;
  const categories = filter.categories || filter.types;
  if (categories?.length) {
    const actual = memory.category || memory.metadata?.category;
    if (!actual || !categories.includes(actual as MemoryCategory)) return false;
  }
  if (filter.scopes?.length) {
    const scopes = new Set(filter.scopes.map((scope) => normalizeMemoryScope(scope)));
    if (!scopes.has(memory.scope)) return false;
  }
  if (filter.tags?.length) {
    const desired = new Set(cleanTags(filter.tags));
    const actual = new Set(memory.tags || []);
    for (const tag of desired) if (!actual.has(tag)) return false;
  }
  return true;
}

export class MemoryStore {
  async upsert(input: MemoryWriteInput): Promise<StoredMemory> {
    return enqueueWrite(async () => {
      const db = await readDb();
      const index = input.id ? db.memories.findIndex((memory) => memory.id === input.id) : -1;
      const memory = normalizeMemory(input, index >= 0 ? db.memories[index] : undefined);
      if (index >= 0) db.memories[index] = memory;
      else db.memories.unshift(memory);
      await writeDb(db);
      return memory;
    });
  }

  async list(filter: MemoryListFilter = {}): Promise<StoredMemory[]> {
    const db = await readDb();
    return db.memories
      .filter((memory) => matchesFilter(memory, filter))
      .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
      .slice(0, filter.limit ?? 50);
  }

  async get(id: string): Promise<StoredMemory | undefined> {
    const db = await readDb();
    return db.memories.find((memory) => memory.id === id);
  }

  async remove(id: string): Promise<boolean> {
    return enqueueWrite(async () => {
      const db = await readDb();
      const before = db.memories.length;
      db.memories = db.memories.filter((memory) => memory.id !== id);
      if (db.memories.length === before) return false;
      await writeDb(db);
      return true;
    });
  }
}

export const memoryStore = new MemoryStore();
