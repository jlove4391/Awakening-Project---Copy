import { memoryService } from './memoryService.js';
import { normalizeMemoryScope, type StoredMemory } from './store.js';
import type { MemoryReference, MemoryScope } from '../types.js';
import type { MemoryCategory } from './memoryTypes.js';

export interface RetrieveMemoryInput {
  sessionId?: string;
  query?: string;
  scopes?: Array<MemoryScope | string>;
  tags?: string[];
  limit?: number;
  includeGlobal?: boolean;
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  categories?: MemoryCategory[];
  types?: MemoryCategory[];
}

export interface RetrievedMemory extends StoredMemory {
  score: number;
  matchedTerms: string[];
}

export async function retrieveMemories(input: RetrieveMemoryInput): Promise<RetrievedMemory[]> {
  return memoryService.searchMemories({
    ...input,
    scopes: input.scopes?.map((scope) => normalizeMemoryScope(scope)),
  }) as Promise<RetrievedMemory[]>;
}

export async function listMemories(sessionId: string, limit = 10, scopes?: Array<MemoryScope | string>): Promise<MemoryReference[]> {
  return memoryService.listMemories({ sessionId, limit, scopes, includeGlobal: true });
}
