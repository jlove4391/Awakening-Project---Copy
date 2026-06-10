import { memoryStore, normalizeMemoryScope, type MemoryWriteInput, type StoredMemory } from './store.js';
import type { MemoryReference, MemoryScope } from '../types.js';

export interface RememberOptions extends Partial<Omit<MemoryWriteInput, 'sessionId' | 'text' | 'scope'>> {
  scope?: MemoryScope | string;
}

export async function writeMemory(input: MemoryWriteInput): Promise<StoredMemory> {
  return memoryStore.upsert({ ...input, scope: normalizeMemoryScope(input.scope) });
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
    createdAt: options.createdAt,
  });
}

export async function deleteMemory(id: string) {
  return memoryStore.remove(id);
}
