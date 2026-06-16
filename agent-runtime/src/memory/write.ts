import { memoryService } from './memoryService.js';
import { normalizeMemoryScope, type MemoryWriteInput, type StoredMemory } from './store.js';
import type { MemoryReference, MemoryScope } from '../types.js';
import type { MemoryActorIdentity, MemoryCategory } from './memoryTypes.js';

export interface RememberOptions extends Partial<Omit<MemoryWriteInput, 'sessionId' | 'text' | 'scope'>> {
  scope?: MemoryScope | string;
  category?: MemoryCategory;
  type?: MemoryCategory;
  actor?: MemoryActorIdentity;
}

export async function writeMemory(input: MemoryWriteInput): Promise<StoredMemory> {
  const memory = await memoryService.createMemory({ ...input, scope: normalizeMemoryScope(input.scope) });
  return memory as StoredMemory;
}

export async function remember(sessionId: string, text: string, options: RememberOptions = {}): Promise<MemoryReference> {
  return writeMemory({
    id: options.id,
    sessionId,
    text,
    scope: options.scope || 'conversation_summary',
    tags: options.tags,
    metadata: options.metadata,
    importance: options.importance,
    source: options.source,
    ownerUserId: options.ownerUserId,
    organizationId: options.organizationId,
    projectId: options.projectId,
    personaId: options.personaId,
    category: options.category,
    type: options.type,
    title: options.title,
    summary: options.summary,
    actor: options.actor,
    createdAt: options.createdAt,
  });
}

export async function deleteMemory(id: string) {
  return memoryService.deleteMemory(id);
}
