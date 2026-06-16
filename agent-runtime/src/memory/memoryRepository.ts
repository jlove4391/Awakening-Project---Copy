import type { MemoryListFilter, MemoryWriteInput, StoredMemory } from './store.js';

export interface MemoryRepository {
  upsert(input: MemoryWriteInput): Promise<StoredMemory>;
  list(filter?: MemoryListFilter): Promise<StoredMemory[]>;
  get(id: string): Promise<StoredMemory | undefined>;
  remove(id: string): Promise<boolean>;
}
