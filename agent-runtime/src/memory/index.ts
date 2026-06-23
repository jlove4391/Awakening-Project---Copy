import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MemorySession, OpenAIConversationsSession, type Session } from '@openai/agents';
import { runtimeConfig } from '../config.js';
import { getRelationshipContext } from '../relationship/relationshipService.js';
import type { AgentTask, MemoryReference, RuntimeContext, SessionRecord } from '../types.js';

const records = new Map<string, SessionRecord>();
const sessions = new Map<string, Session>();

const sessionsDir = path.join(runtimeConfig.dataDir, 'sessions');

async function ensureStore() {
  await fs.mkdir(sessionsDir, { recursive: true });
}

function recordPath(sessionId: string) {
  return path.join(sessionsDir, `${sessionId}.json`);
}

function now() {
  return new Date().toISOString();
}

function createRecord(sessionId: string): SessionRecord {
  const useOpenAIConversations =
    runtimeConfig.sessionBackend === 'openai-conversations' ||
    (runtimeConfig.sessionBackend === 'auto' && Boolean(process.env.OPENAI_API_KEY));

  return {
    id: sessionId,
    provider: useOpenAIConversations ? 'openai-conversations' : 'local-memory',
    memories: [],
    tasks: [],
    updatedAt: now(),
  };
}

async function loadRecord(sessionId: string): Promise<SessionRecord> {
  if (records.has(sessionId)) return records.get(sessionId)!;

  await ensureStore();
  try {
    const raw = await fs.readFile(recordPath(sessionId), 'utf8');
    const parsed = JSON.parse(raw) as SessionRecord;
    records.set(sessionId, parsed);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const fresh = createRecord(sessionId);
    records.set(sessionId, fresh);
    await saveRecord(fresh);
    return fresh;
  }
}

export async function saveRecord(record: SessionRecord) {
  await ensureStore();
  record.updatedAt = now();
  records.set(record.id, record);
  await fs.writeFile(recordPath(record.id), `${JSON.stringify(record, null, 2)}\n`);
}

export async function getRuntimeContext(sessionId: string = randomUUID()): Promise<RuntimeContext> {
  const record = await loadRecord(sessionId);
  let session = sessions.get(sessionId);

  if (!session) {
    session =
      record.provider === 'openai-conversations'
        ? new OpenAIConversationsSession({ conversationId: record.providerConversationId })
        : new MemorySession({ sessionId, initialItems: record.localItems as never[] | undefined });

    sessions.set(sessionId, session);
  }

  if (record.provider === 'openai-conversations' && !record.providerConversationId) {
    record.providerConversationId = await session.getSessionId();
    await saveRecord(record);
  }

  return { sessionId, session, record, relationshipContext: await getRelationshipContext('jordan') };
}

export async function persistRuntimeContext(context: RuntimeContext) {
  if (context.record.provider === 'local-memory') {
    context.record.localItems = await context.session.getItems();
  } else {
    context.record.providerConversationId = await context.session.getSessionId();
  }
  await saveRecord(context.record);
}


export async function createTask(sessionId: string, title: string, notes?: string) {
  const context = await getRuntimeContext(sessionId);
  const task: AgentTask = {
    id: randomUUID(),
    title,
    notes,
    status: 'queued',
    createdAt: now(),
    updatedAt: now(),
  };
  context.record.tasks.unshift(task);
  await saveRecord(context.record);
  return task;
}

export async function listTasks(sessionId: string) {
  const context = await getRuntimeContext(sessionId);
  return context.record.tasks;
}

export async function updateTask(sessionId: string, taskId: string, patch: Partial<AgentTask>) {
  const context = await getRuntimeContext(sessionId);
  const task = context.record.tasks.find((item) => item.id === taskId);
  if (!task) return undefined;
  Object.assign(task, patch, { updatedAt: now() });
  await saveRecord(context.record);
  return task;
}

export { durableMemoryScopes, memoryStore, normalizeMemoryScope, type MemoryListFilter, type MemoryWriteInput, type StoredMemory } from './store.js';
export { listMemories, retrieveMemories, type RetrieveMemoryInput, type RetrievedMemory } from './retrieve.js';
export { deleteMemory, remember, writeMemory, type RememberOptions } from './write.js';
export { replaceConversationSummary, summarizeMemories, writeConversationSummary, type SummarizeMemoryInput } from './summarize.js';
export { memoryService, MemoryService } from './memoryService.js';
export { AlphaMemoryConfidence, AlphaMemoryStatus, AlphaMemoryType } from './memoryTypes.js';
export type {
  CreateMemoryInput,
  MemoryActorIdentity,
  MemoryActorType,
  MemoryCategory,
  MemoryDecisionInput,
  MemoryRecord,
  MemorySearchFilter,
  MemorySource,
  ProjectTimeline,
  ReceiptMemoryInput,
  SessionContext,
  TchaiMemoryMetadata,
  UpdateMemoryPatch,
  WorkOrderMemoryInput,
} from './memoryTypes.js';
export type { MemoryRepository } from './memoryRepository.js';
export { JsonMemoryAdapter, jsonMemoryAdapter } from './adapters/jsonMemoryAdapter.js';
export { PostgresMemoryAdapterStub } from './adapters/postgresMemoryAdapter.stub.js';
