import type { MemoryReference, MemoryScope } from '../types.js';

export type MemoryCategory =
  | 'fact'
  | 'preference'
  | 'decision'
  | 'event'
  | 'project_note'
  | 'work_order'
  | 'approval'
  | 'receipt'
  | 'relationship'
  | 'persona_lesson'
  | 'conversation_summary';

export type MemoryActorType = 'user' | 'persona' | 'system' | 'agent' | 'api' | 'voice' | 'migration';
export type MemorySource = 'agent' | 'user' | 'system' | 'api' | 'voice' | 'migration';

export enum AlphaMemoryType {
  Fact = 'fact',
  Preference = 'preference',
  Decision = 'decision',
  Event = 'event',
  ProjectNote = 'project_note',
  WorkOrder = 'work_order',
  Approval = 'approval',
  Receipt = 'receipt',
  Relationship = 'relationship',
  PersonaLesson = 'persona_lesson',
  ConversationSummary = 'conversation_summary',
}

export enum AlphaMemoryConfidence {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

export enum AlphaMemoryStatus {
  Candidate = 'candidate',
  Active = 'active',
  Canonical = 'canonical',
  Deprecated = 'deprecated',
  Rejected = 'rejected',
  Archived = 'archived',
  Superseded = 'superseded',
  Disputed = 'disputed',
}


export interface MemoryActorIdentity {
  actorId?: string;
  actorType?: MemoryActorType;
  displayName?: string;
}

export interface TchaiMemoryMetadata extends Record<string, unknown> {
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  actorId?: string;
  actorType?: MemoryActorType;
  category?: MemoryCategory;
  title?: string;
}

export interface MemoryRecord extends MemoryReference {
  sessionId: string;
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  alphaType?: AlphaMemoryType;
  confidence: AlphaMemoryConfidence;
  status: AlphaMemoryStatus;
  reviewNeeded: boolean;
  contradicts: string[];
  retrievalPriority: number;
  category: MemoryCategory;
  title?: string;
  text: string;
  summary?: string;
  scope: MemoryScope;
  source: MemorySource;
  importance: number;
  tags: string[];
  metadata: TchaiMemoryMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMemoryInput {
  id?: string;
  sessionId?: string;
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  alphaType?: AlphaMemoryType;
  confidence?: AlphaMemoryConfidence;
  status?: AlphaMemoryStatus;
  reviewNeeded?: boolean;
  contradicts?: string[];
  retrievalPriority?: number;
  category?: MemoryCategory;
  type?: MemoryCategory;
  title?: string;
  text: string;
  summary?: string;
  scope?: MemoryScope | string;
  source?: MemorySource;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  actor?: MemoryActorIdentity;
  createdAt?: string;
}

export interface UpdateMemoryPatch {
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  alphaType?: AlphaMemoryType;
  confidence?: AlphaMemoryConfidence;
  status?: AlphaMemoryStatus;
  reviewNeeded?: boolean;
  contradicts?: string[];
  retrievalPriority?: number;
  category?: MemoryCategory;
  type?: MemoryCategory;
  title?: string;
  text?: string;
  summary?: string;
  scope?: MemoryScope | string;
  source?: MemorySource;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  actor?: MemoryActorIdentity;
}

export interface MemorySearchFilter {
  sessionId?: string;
  ownerUserId?: string;
  organizationId?: string;
  projectId?: string;
  personaId?: string;
  alphaTypes?: AlphaMemoryType[];
  confidence?: AlphaMemoryConfidence | AlphaMemoryConfidence[];
  statuses?: AlphaMemoryStatus[];
  reviewNeeded?: boolean;
  contradicts?: string[];
  minRetrievalPriority?: number;
  categories?: MemoryCategory[];
  types?: MemoryCategory[];
  scopes?: Array<MemoryScope | string>;
  tags?: string[];
  query?: string;
  includeGlobal?: boolean;
  limit?: number;
}

export interface MemoryDecisionInput extends Omit<CreateMemoryInput, 'category' | 'text'> {
  decision: string;
  rationale?: string;
}

export interface WorkOrderMemoryInput extends Omit<CreateMemoryInput, 'category' | 'text' | 'status'> {
  workOrderId?: string;
  objective: string;
  status?: string;
}

export interface ReceiptMemoryInput extends Omit<CreateMemoryInput, 'category' | 'text' | 'status'> {
  receiptId?: string;
  action: string;
  status?: string;
}

export interface SessionContext {
  sessionId: string;
  memories: MemoryRecord[];
  summary: string;
}

export interface ProjectTimeline {
  projectId: string;
  memories: MemoryRecord[];
}
