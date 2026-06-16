import { memoryStore, type MemoryListFilter, type MemoryWriteInput, type StoredMemory } from '../store.js';
import type { MemoryRepository } from '../memoryRepository.js';

export class JsonMemoryAdapter implements MemoryRepository {
  upsert(input: MemoryWriteInput): Promise<StoredMemory> {
    return memoryStore.upsert(input);
  }

  list(filter: MemoryListFilter = {}): Promise<StoredMemory[]> {
    return memoryStore.list(filter);
  }

  get(id: string): Promise<StoredMemory | undefined> {
    return memoryStore.get(id);
  }

  remove(id: string): Promise<boolean> {
    return memoryStore.remove(id);
  }
}

export const jsonMemoryAdapter = new JsonMemoryAdapter();
