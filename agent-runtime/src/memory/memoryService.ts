import { jsonMemoryAdapter } from './adapters/jsonMemoryAdapter.js';
import { PostgresMemoryAdapterStub } from './adapters/postgresMemoryAdapter.stub.js';
import type { MemoryRepository } from './memoryRepository.js';
import type {
  CreateMemoryInput,
  MemoryCategory,
  MemoryDecisionInput,
  MemoryRecord,
  MemorySearchFilter,
  ProjectTimeline,
  ReceiptMemoryInput,
  SessionContext,
  UpdateMemoryPatch,
  WorkOrderMemoryInput,
} from './memoryTypes.js';
import { normalizeMemoryScope, type MemoryListFilter, type StoredMemory } from './store.js';

const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'were', 'have', 'has']);

function selectedRepository(): MemoryRepository {
  const adapter = (process.env.MEMORY_STORAGE_ADAPTER || 'json').trim().toLowerCase();
  if (!adapter || adapter === 'json') return jsonMemoryAdapter;
  if (adapter === 'postgres') return new PostgresMemoryAdapterStub();
  throw new Error(`Unsupported MEMORY_STORAGE_ADAPTER "${adapter}". Supported values: json, postgres.`);
}

function tokenize(text: string | undefined) {
  return [...new Set(String(text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((term) => term.length > 2 && !stopWords.has(term)) || [])];
}

function firstSentence(text: string) {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] || text;
}

function inferCategory(input: Pick<CreateMemoryInput, 'category' | 'type' | 'scope'>): MemoryCategory {
  if (input.category) return input.category;
  if (input.type) return input.type;
  if (input.scope === 'conversation_summary' || input.scope === 'session') return 'conversation_summary';
  if (input.scope === 'preferences') return 'preference';
  if (input.scope === 'agent_lessons') return 'persona_lesson';
  return 'fact';
}

function memoryFilterToRepositoryFilter(filter: MemorySearchFilter = {}): MemoryListFilter {
  return {
    sessionId: filter.sessionId,
    ownerUserId: filter.ownerUserId,
    organizationId: filter.organizationId,
    projectId: filter.projectId,
    personaId: filter.personaId,
    categories: filter.categories || filter.types,
    alphaTypes: filter.alphaTypes,
    confidence: filter.confidence,
    statuses: filter.statuses,
    reviewNeeded: filter.reviewNeeded,
    contradicts: filter.contradicts,
    minRetrievalPriority: filter.minRetrievalPriority,
    scopes: filter.scopes,
    tags: filter.tags,
    includeGlobal: filter.includeGlobal,
    limit: filter.query ? Math.max(filter.limit ?? 10, 50) : filter.limit,
  };
}

function toMemoryRecord(memory: StoredMemory): MemoryRecord {
  const metadata = memory.metadata || {};
  return {
    ...memory,
    ownerUserId: memory.ownerUserId || (metadata.ownerUserId as string | undefined),
    organizationId: memory.organizationId || (metadata.organizationId as string | undefined),
    projectId: memory.projectId || (metadata.projectId as string | undefined),
    personaId: memory.personaId || (metadata.personaId as string | undefined),
    category: memory.category || (metadata.category as MemoryCategory | undefined) || (memory.scope === 'conversation_summary' ? 'conversation_summary' : 'fact'),
    title: memory.title || (metadata.title as string | undefined),
    summary: memory.summary || (metadata.summary as string | undefined),
    alphaType: memory.alphaType,
    confidence: memory.confidence,
    status: memory.status,
    reviewNeeded: memory.reviewNeeded,
    contradicts: memory.contradicts || [],
    retrievalPriority: memory.retrievalPriority,
    tags: memory.tags || [],
    metadata,
  };
}

function scoreMemory(memory: MemoryRecord, queryTerms: string[]) {
  if (!queryTerms.length) return { score: 1 + memory.importance, matchedTerms: [] };
  const haystack = `${memory.title || ''} ${memory.text} ${memory.summary || ''} ${memory.scope} ${memory.category} ${(memory.tags || []).join(' ')}`.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
  const recencyBoost = Math.max(0, 1 - (Date.now() - Date.parse(memory.updatedAt || memory.createdAt)) / (1000 * 60 * 60 * 24 * 30)) * 0.25;
  return {
    score: matchedTerms.length / queryTerms.length + memory.importance * 0.35 + recencyBoost,
    matchedTerms,
  };
}

export class MemoryService {
  constructor(private readonly repository: MemoryRepository = selectedRepository()) {}

  async createMemory(input: CreateMemoryInput): Promise<MemoryRecord> {
    const category = inferCategory(input);
    const metadata = {
      ...(input.metadata || {}),
      ...(input.ownerUserId ? { ownerUserId: input.ownerUserId } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.personaId ? { personaId: input.personaId } : {}),
      category,
      ...(input.title ? { title: input.title } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.alphaType ? { alphaType: input.alphaType } : {}),
      ...(input.confidence ? { confidence: input.confidence } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.reviewNeeded !== undefined ? { reviewNeeded: input.reviewNeeded } : {}),
      ...(input.contradicts !== undefined ? { contradicts: input.contradicts } : {}),
      ...(input.retrievalPriority !== undefined ? { retrievalPriority: input.retrievalPriority } : {}),
      ...(input.actor?.actorId ? { actorId: input.actor.actorId } : {}),
      ...(input.actor?.actorType ? { actorType: input.actor.actorType } : {}),
      ...(input.actor?.displayName ? { actorDisplayName: input.actor.displayName } : {}),
    };
    const memory = await this.repository.upsert({
      id: input.id,
      sessionId: input.sessionId || 'global',
      text: input.text,
      scope: normalizeMemoryScope(input.scope || (category === 'conversation_summary' ? 'conversation_summary' : 'business_context')),
      tags: input.tags,
      metadata,
      importance: input.importance,
      source: input.source || (input.actor?.actorType === 'user' ? 'user' : input.actor?.actorType === 'system' ? 'system' : 'agent'),
      ownerUserId: input.ownerUserId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      personaId: input.personaId,
      category,
      title: input.title,
      summary: input.summary,
      alphaType: input.alphaType,
      confidence: input.confidence,
      status: input.status,
      reviewNeeded: input.reviewNeeded,
      contradicts: input.contradicts,
      retrievalPriority: input.retrievalPriority,
      actor: input.actor,
      createdAt: input.createdAt,
    });
    return toMemoryRecord(memory);
  }

  async updateMemory(id: string, patch: UpdateMemoryPatch): Promise<MemoryRecord | undefined> {
    const existing = await this.repository.get(id);
    if (!existing) return undefined;
    const metadata = { ...(existing.metadata || {}), ...(patch.metadata || {}) };
    const updated = await this.repository.upsert({
      id,
      sessionId: existing.sessionId,
      text: patch.text ?? existing.text,
      scope: patch.scope ?? existing.scope,
      tags: patch.tags ?? existing.tags,
      metadata,
      importance: patch.importance ?? existing.importance,
      source: patch.source ?? existing.source,
      ownerUserId: patch.ownerUserId ?? existing.ownerUserId,
      organizationId: patch.organizationId ?? existing.organizationId,
      projectId: patch.projectId ?? existing.projectId,
      personaId: patch.personaId ?? existing.personaId,
      category: patch.category || patch.type || existing.category,
      title: patch.title ?? existing.title,
      summary: patch.summary ?? existing.summary,
      alphaType: patch.alphaType ?? existing.alphaType,
      confidence: patch.confidence ?? existing.confidence,
      status: patch.status ?? existing.status,
      reviewNeeded: patch.reviewNeeded ?? existing.reviewNeeded,
      contradicts: patch.contradicts ?? existing.contradicts,
      retrievalPriority: patch.retrievalPriority ?? existing.retrievalPriority,
      actor: patch.actor,
      createdAt: existing.createdAt,
    });
    return toMemoryRecord(updated);
  }

  deleteMemory(id: string): Promise<boolean> {
    return this.repository.remove(id);
  }

  async getMemoryById(id: string): Promise<MemoryRecord | undefined> {
    const memory = await this.repository.get(id);
    return memory ? toMemoryRecord(memory) : undefined;
  }

  async listMemories(filter: MemorySearchFilter = {}): Promise<MemoryRecord[]> {
    const memories = await this.repository.list(memoryFilterToRepositoryFilter(filter));
    return memories.map(toMemoryRecord);
  }

  async searchMemories(filter: MemorySearchFilter = {}): Promise<Array<MemoryRecord & { score: number; matchedTerms: string[] }>> {
    const queryTerms = tokenize(filter.query);
    const candidates = await this.listMemories({ ...filter, includeGlobal: filter.includeGlobal ?? true });
    return candidates
      .map((memory) => ({ ...memory, ...scoreMemory(memory, queryTerms) }))
      .filter((memory) => !queryTerms.length || memory.matchedTerms.length > 0)
      .sort((a, b) => b.score - a.score || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, filter.limit ?? 10);
  }

  recordDecision(input: MemoryDecisionInput): Promise<MemoryRecord> {
    return this.createMemory({
      ...input,
      category: 'decision',
      title: input.title || 'Decision',
      text: input.rationale ? `${input.decision}\n\nRationale: ${input.rationale}` : input.decision,
      tags: ['decision', ...(input.tags || [])],
    });
  }

  recordWorkOrderMemory(input: WorkOrderMemoryInput): Promise<MemoryRecord> {
    const { status: workOrderStatus, ...memoryInput } = input;
    return this.createMemory({
      ...memoryInput,
      category: 'work_order',
      title: input.title || `Work order${input.workOrderId ? ` ${input.workOrderId}` : ''}`,
      text: `${input.objective}${workOrderStatus ? `\nStatus: ${workOrderStatus}` : ''}`,
      tags: ['work-order', ...(input.tags || [])],
      metadata: { ...(input.metadata || {}), workOrderId: input.workOrderId, status: workOrderStatus },
    });
  }

  recordReceiptMemory(input: ReceiptMemoryInput): Promise<MemoryRecord> {
    const { status: receiptStatus, ...memoryInput } = input;
    return this.createMemory({
      ...memoryInput,
      category: 'receipt',
      title: input.title || `Receipt${input.receiptId ? ` ${input.receiptId}` : ''}`,
      text: `${input.action}${receiptStatus ? `\nStatus: ${receiptStatus}` : ''}`,
      tags: ['receipt', ...(input.tags || [])],
      metadata: { ...(input.metadata || {}), receiptId: input.receiptId, status: receiptStatus },
    });
  }

  async getProjectTimeline(projectId: string): Promise<ProjectTimeline> {
    const memories = await this.listMemories({ projectId, limit: 250 });
    return { projectId, memories: memories.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) };
  }

  async getSessionContext(sessionId: string): Promise<SessionContext> {
    const memories = await this.searchMemories({ sessionId, includeGlobal: true, limit: 25 });
    const summary = memories.map((memory) => `${memory.category}: ${firstSentence(memory.summary || memory.text)}`).join('\n');
    return { sessionId, memories, summary };
  }
}

export const memoryService = new MemoryService();
