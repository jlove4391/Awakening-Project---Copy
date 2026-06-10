import type { Session } from '@openai/agents';

export type TaskStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed';

export interface MemoryReference {
  id: string;
  text: string;
  scope: 'user' | 'project' | 'session';
  createdAt: string;
  tags?: string[];
}

export interface AgentTask {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface SessionRecord {
  id: string;
  provider: 'openai-conversations' | 'local-memory';
  providerConversationId?: string;
  localItems?: unknown[];
  memories: MemoryReference[];
  tasks: AgentTask[];
  updatedAt: string;
}

export interface RuntimeContext {
  sessionId: string;
  session: Session;
  record: SessionRecord;
}

export type RuntimeAgentName = 'elora' | 'nexora';

export interface ChatRequestBody {
  message?: string;
  sessionId?: string;
  agent?: RuntimeAgentName;
}
