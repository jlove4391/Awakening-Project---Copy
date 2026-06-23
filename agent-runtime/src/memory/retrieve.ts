import { memoryService } from './memoryService.js';
import { normalizeMemoryScope, type StoredMemory } from './store.js';
import type { MemoryReference, MemoryScope } from '../types.js';
import { AlphaMemoryStatus, type AlphaMemoryConfidence, type AlphaMemoryType, type MemoryCategory } from './memoryTypes.js';

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
  alphaTypes?: AlphaMemoryType[];
  confidence?: AlphaMemoryConfidence | AlphaMemoryConfidence[];
  statuses?: AlphaMemoryStatus[];
  reviewNeeded?: boolean;
  contradicts?: string[];
  minRetrievalPriority?: number;
}

export interface RetrievedMemory extends StoredMemory {
  score: number;
  matchedTerms: string[];
}

export async function retrieveMemories(input: RetrieveMemoryInput): Promise<RetrievedMemory[]> {
  const statuses = input.statuses?.length
    ? input.statuses
    : Object.values(AlphaMemoryStatus).filter((status) => status !== AlphaMemoryStatus.Deprecated && status !== AlphaMemoryStatus.Rejected);
  return memoryService.searchMemories({
    ...input,
    statuses,
    scopes: input.scopes?.map((scope) => normalizeMemoryScope(scope)),
  }) as Promise<RetrievedMemory[]>;
}

export async function listMemories(sessionId: string, limit = 10, scopes?: Array<MemoryScope | string>): Promise<MemoryReference[]> {
  return memoryService.listMemories({ sessionId, limit, scopes, includeGlobal: true });
}
