import type { ExecutionMode, RuntimeAgentName } from '../types.js';

export const coreCommandStates = [
  'intent_received',
  'context_assembled',
  'authority_decided',
  'planning',
  'executing',
  'delegated',
  'approval_pending',
  'setup_required',
  'validating',
  'receipted',
  'memory_candidates_recorded',
  'response_synthesized',
  'completed',
  'blocked',
  'failed',
  'cancelled',
] as const;

export type CoreCommandState = (typeof coreCommandStates)[number];
export type CoreCommandTerminalState = Extract<CoreCommandState, 'completed' | 'blocked' | 'failed' | 'cancelled'>;
export type CoreCommandAuthorityDecision = 'execute_with_receipts' | 'trust_scoped' | 'observe_only' | 'approval_pending' | 'setup_required' | 'blocked';

export interface CoreCommandEvent {
  id: string;
  commandId: string;
  state: CoreCommandState;
  previousState?: CoreCommandState;
  occurredAt: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface CoreCommandLinks {
  memoryReferenceIds: string[];
  memoryCandidateIds: string[];
  taskIds: string[];
  executionIds: string[];
  receiptIds: string[];
}

export interface CoreCommandAuthority {
  decision: CoreCommandAuthorityDecision;
  executionMode: ExecutionMode;
  autonomyLevel?: number;
  reason: string;
  decidedAt: string;
}

export interface CoreCommandRecord {
  id: string;
  sessionId: string;
  agent: RuntimeAgentName;
  requestText: string;
  state: CoreCommandState;
  authority?: CoreCommandAuthority;
  context: {
    assembledAt?: string;
    relationshipSubjectId?: string;
    baselineExecutionIds?: string[];
  };
  links: CoreCommandLinks;
  finalOutput?: unknown;
  error?: { message: string; stack?: string };
  events: CoreCommandEvent[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CreateCoreCommandInput {
  sessionId: string;
  agent: RuntimeAgentName;
  requestText: string;
}

export interface CoreCommandTransitionPatch {
  summary?: string;
  details?: Record<string, unknown>;
  authority?: CoreCommandAuthority;
  context?: Partial<CoreCommandRecord['context']>;
  links?: Partial<CoreCommandLinks>;
  finalOutput?: unknown;
  error?: CoreCommandRecord['error'];
}
