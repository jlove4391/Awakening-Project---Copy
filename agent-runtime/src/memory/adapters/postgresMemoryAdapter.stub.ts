import type { MemoryRepository } from '../memoryRepository.js';
import type { MemoryListFilter, MemoryWriteInput, StoredMemory } from '../store.js';

export class PostgresMemoryAdapterStub implements MemoryRepository {
  private unavailable(): never {
    throw new Error(
      'MEMORY_STORAGE_ADAPTER=postgres was requested, but the PostgreSQL memory adapter is not implemented yet. Use MEMORY_STORAGE_ADAPTER=json for now. Future configuration will use DATABASE_URL.',
    );
  }

  upsert(_input: MemoryWriteInput): Promise<StoredMemory> {
    this.unavailable();
  }

  list(_filter: MemoryListFilter = {}): Promise<StoredMemory[]> {
    this.unavailable();
  }

  get(_id: string): Promise<StoredMemory | undefined> {
    this.unavailable();
  }

  remove(_id: string): Promise<boolean> {
    this.unavailable();
  }
}
