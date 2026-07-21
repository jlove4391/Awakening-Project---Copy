import type { AutonomyEnvelopeLevel, TrustDomainScore } from '../governance/trustService.js';
import type { RetrievedMemory } from '../memory/retrieve.js';
import type { RelationshipContext, RelationshipProfileEntry } from '../relationship/relationshipTypes.js';
import type { ExecutionMode, RuntimeAgentName } from '../types.js';

export type CoreValidationRequirement = 'standard' | 'enhanced' | 'strict';
export type CoreExecutionScopeLimit = 'read_only' | 'single_bounded_action' | 'bounded_multi_step' | 'expanded_bounded';

export interface CoreIdentityRecord {
  id: 'core';
  name: 'Vireon CORE';
  acronym: 'Co-Operative Relational Evolution';
  category: 'persistent_relational_intelligence';
  sovereignUserId: 'jordan';
  executiveAgent: 'elora';
  technicalOfficer: 'nexora';
  doctrineVersion: number;
  purpose: string;
  progression: ['memory', 'identity', 'relationship', 'trust', 'autonomy', 'execution'];
  governingPrinciples: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CoreContextTaskReference {
  id: string;
  sessionId: string;
  objective: string;
  status: string;
  assignedAgent: string;
  updatedAt: string;
  receiptId?: string;
}

export interface CoreContextCommandReference {
  id: string;
  sessionId: string;
  requestText: string;
  state: string;
  updatedAt: string;
  receiptIds: string[];
}

export interface CoreContextReceiptReference {
  executionId: string;
  receiptId: string;
  action: string;
  status: string;
  summary: string;
  issuedAt: string;
  taskIds: string[];
}

export interface CoreExecutionEnvelope {
  primaryTrustDomain: string;
  trustScore: number;
  autonomyEnvelope: AutonomyEnvelopeLevel;
  requestedAutonomyLevel: number;
  effectiveAutonomyLevel: number;
  validationRequirement: CoreValidationRequirement;
  scopeLimit: CoreExecutionScopeLimit;
  reasons: string[];
}

export interface CoreContextReferences {
  identityIds: string[];
  memoryIds: string[];
  relationshipEntryIds: string[];
  taskIds: string[];
  commandIds: string[];
  executionIds: string[];
  receiptIds: string[];
  trustDomains: string[];
}

export interface CoreContextContinuity {
  currentObjective: string;
  priorActiveObjective?: string;
  governingDecisions: RetrievedMemory[];
  currentGoals: RelationshipProfileEntry[];
  latestCorrections: RelationshipProfileEntry[];
  unfinishedTasks: CoreContextTaskReference[];
  unfinishedCommands: CoreContextCommandReference[];
  recentReceipts: CoreContextReceiptReference[];
}

export interface CoreContextBundle {
  id: string;
  sessionId: string;
  commandId?: string;
  requestText: string;
  agent: RuntimeAgentName;
  executionMode: ExecutionMode;
  assembledAt: string;
  identity: CoreIdentityRecord;
  relationship: {
    context: RelationshipContext;
    preferences: RelationshipProfileEntry[];
    goals: RelationshipProfileEntry[];
    corrections: RelationshipProfileEntry[];
    workingStyle: RelationshipProfileEntry[];
    recurringContexts: RelationshipProfileEntry[];
    longTermObjectives: RelationshipProfileEntry[];
  };
  memories: RetrievedMemory[];
  trust: {
    overallScore: number;
    overallEnvelope: AutonomyEnvelopeLevel;
    primaryDomain: TrustDomainScore;
    domains: TrustDomainScore[];
    recommendations: string[];
  };
  executionEnvelope: CoreExecutionEnvelope;
  continuity: CoreContextContinuity;
  references: CoreContextReferences;
}

export interface AssembleCoreContextInput {
  sessionId: string;
  requestText: string;
  agent?: RuntimeAgentName;
  executionMode: ExecutionMode;
  requestedAutonomyLevel?: number;
  commandId?: string;
  subjectId?: string;
}
