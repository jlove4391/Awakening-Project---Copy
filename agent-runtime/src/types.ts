import type { Session } from '@openai/agents';
import type { RuntimeAgentName } from '@awakening/shared';

export type { RuntimeAgentName } from '@awakening/shared';

export type TaskStatus = 'queued' | 'running' | 'blocked' | 'completed' | 'failed';

export type MemoryScope =
  | 'user_profile'
  | 'business_context'
  | 'contacts'
  | 'leads'
  | 'preferences'
  | 'agent_lessons'
  | 'task_history'
  | 'conversation_summary';

export interface MemoryReference {
  id: string;
  text: string;
  scope: MemoryScope;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  importance?: number;
  source?: 'agent' | 'user' | 'system' | 'api' | 'voice' | 'migration';
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

export type RuntimeChannel = 'text' | 'voice';

export interface VoiceApprovalPolicy {
  allowHighRiskActions: boolean;
  maxHighRiskActions: number;
  approvedHighRiskActions: number;
  approvalNote?: string;
  mode?: 'browser_session' | 'phone_call' | 'meeting';
  lockedReason?: string;
}

export interface RuntimeContext {
  sessionId: string;
  session: Session;
  record: SessionRecord;
  channel?: RuntimeChannel;
  voiceSessionId?: string;
  voiceApproval?: VoiceApprovalPolicy;
  agent?: RuntimeAgentName;
}

export interface AgentMessageRequest {
  message?: string;
  sessionId?: string;
  channel?: RuntimeChannel;
  voiceSessionId?: string;
  voiceApproval?: VoiceApprovalPolicy;
  agent?: RuntimeAgentName;
}

export interface AgentMessageEvent {
  event: 'session' | 'memory' | 'runtime_event' | 'delta' | 'completed' | 'error';
  data: any;
}

export interface ChatRequestBody {
  message?: string;
  sessionId?: string;
  agent?: RuntimeAgentName;
}
