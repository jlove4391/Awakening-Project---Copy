import { memoryStore, normalizeMemoryScope, type StoredMemory } from './store.js';
import type { MemoryReference, MemoryScope } from '../types.js';

export interface RetrieveMemoryInput {
  sessionId?: string;
  query?: string;
  scopes?: Array<MemoryScope | string>;
  tags?: string[];
  limit?: number;
  includeGlobal?: boolean;
}

export interface RetrievedMemory extends StoredMemory {
  score: number;
  matchedTerms: string[];
}

const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'are', 'was', 'were', 'have', 'has']);

function tokenize(text: string | undefined) {
  return [...new Set(String(text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((term) => term.length > 2 && !stopWords.has(term)) || [])];
}

function scoreMemory(memory: StoredMemory, queryTerms: string[]) {
  if (!queryTerms.length) return { score: 1 + memory.importance, matchedTerms: [] };
  const haystack = `${memory.text} ${memory.scope} ${(memory.tags || []).join(' ')}`.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
  const recencyBoost = Math.max(0, 1 - (Date.now() - Date.parse(memory.updatedAt || memory.createdAt)) / (1000 * 60 * 60 * 24 * 30)) * 0.25;
  return {
    score: matchedTerms.length / queryTerms.length + memory.importance * 0.35 + recencyBoost,
    matchedTerms,
  };
}

export async function retrieveMemories(input: RetrieveMemoryInput): Promise<RetrievedMemory[]> {
  const queryTerms = tokenize(input.query);
  const candidates = await memoryStore.list({
    sessionId: input.sessionId,
    scopes: input.scopes?.map((scope) => normalizeMemoryScope(scope)),
    tags: input.tags,
    includeGlobal: input.includeGlobal ?? true,
    limit: Math.max(input.limit ?? 10, 50),
  });

  return candidates
    .map((memory) => ({ ...memory, ...scoreMemory(memory, queryTerms) }))
    .filter((memory) => !queryTerms.length || memory.matchedTerms.length > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, input.limit ?? 10);
}

export async function listMemories(sessionId: string, limit = 10, scopes?: Array<MemoryScope | string>): Promise<MemoryReference[]> {
  return memoryStore.list({ sessionId, limit, scopes, includeGlobal: true });
}
