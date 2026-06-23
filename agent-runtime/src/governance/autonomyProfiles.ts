import path from 'node:path';
import type { RegisteredToolDefinition } from '../tools/registry.js';
import { runtimeConfig, type AutonomyLevel } from '../config.js';
import type { ExecutionMode } from '../types.js';
import { decideToolPolicy, policyRequiresApproval } from './policyDecision.js';

export type AutonomyProfileName = 'dev_autonomy' | 'proactive_observation';

export const autonomyLevelDefinitions = {
  0: { label: 'reactive_only', description: 'Reactive only; ELORA/CORE acts only in direct response to user requests.' },
  1: { label: 'proactive_read_only_observation', description: 'Proactive read-only observation; no stored recommendations or writes.' },
  2: { label: 'ranked_recommendations', description: 'Read-only observation plus ranked internal recommendations.' },
  3: { label: 'trusted_execution', description: 'Trusted autonomy; ordinary workspace execution may run with receipts while explicit policy boundaries still require approval.' },
} as const satisfies Record<AutonomyLevel, { label: string; description: string }>;

export function isKnownAutonomyLevel(value: unknown): value is AutonomyLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function normalizeAutonomyLevel(value: unknown, fallback: AutonomyLevel = runtimeConfig.autonomy.level): AutonomyLevel {
  return value === 0 || value === 1 || value === 2 || value === 3 ? value : fallback;
}

export function activeAutonomyLevel(context?: { autonomyLevel?: AutonomyLevel }): AutonomyLevel {
  return normalizeAutonomyLevel(context?.autonomyLevel);
}


const DEV_AUTONOMY_WEB_TOOLS = new Set(['web.fetch_url', 'web.crawl_site']);

export function isKnownAutonomyProfile(value: unknown): value is AutonomyProfileName {
  return value === 'dev_autonomy' || value === 'proactive_observation';
}

export function devAutonomyAllowsWithoutApproval(definition: RegisteredToolDefinition, input: Record<string, unknown>) {
  const decision = decideToolPolicy(definition, input);
  return !policyRequiresApproval(decision);
}

export function isDraftPatchProposalInput(input: Record<string, unknown>) {
  return Boolean(input.draftPatchProposal || input.draftPatch || input.proposedPatch);
}

export function autonomyLevelAllows(
  level: AutonomyLevel,
  definition: RegisteredToolDefinition,
  input: Record<string, unknown> = {},
  executionMode?: ExecutionMode,
) {
  const mode = normalizeExecutionMode(executionMode, level === 0 ? 'reactive' : 'observation');
  const policyDecision = decideToolPolicy(definition, input);
  if (policyRequiresApproval(policyDecision)) return false;
  if (mode === 'reactive' || mode === 'delegated') return true;
  if (mode === 'observation') return definition.riskLevel === 'read' || policyDecision.decision === 'report';
  return level >= 3;
}

export function proactiveObservationAllows(definition: RegisteredToolDefinition, level: AutonomyLevel = runtimeConfig.autonomy.level, input: Record<string, unknown> = {}) {
  return autonomyLevelAllows(level, definition, input, 'observation');
}

export function requiresApprovalForAutonomyProfile(
  profile: AutonomyProfileName | undefined,
  definition: RegisteredToolDefinition,
  input: Record<string, unknown>,
) {
  if (profile === 'proactive_observation') return !proactiveObservationAllows(definition, activeAutonomyLevel({ autonomyLevel: runtimeConfig.autonomy.level || 2 }), input);
  return !devAutonomyAllowsWithoutApproval(definition, input);
}

export function normalizeExecutionMode(value: unknown, fallback: ExecutionMode = 'reactive'): ExecutionMode {
  return value === 'reactive' || value === 'delegated' || value === 'autonomous' || value === 'observation' ? value : fallback;
}

export function requiresApprovalForExecutionMode(
  executionMode: ExecutionMode | undefined,
  profile: AutonomyProfileName | undefined,
  definition: RegisteredToolDefinition,
  input: Record<string, unknown>,
  approvalScope?: string,
) {
  const mode = normalizeExecutionMode(executionMode, profile ? 'autonomous' : 'reactive');
  if (mode === 'observation' || profile === 'proactive_observation') return !proactiveObservationAllows(definition, runtimeConfig.autonomy.level, input);
  const policyDecision = decideToolPolicy(definition, input, approvalScope);

}

export const devAutonomyProfile = {
  name: 'dev_autonomy' as const,
  allowedWithoutAdditionalApproval: {
    readOnlyInspection: true,
    webTools: [...DEV_AUTONOMY_WEB_TOOLS],
    internalDrafts: true,
    workspaceBoundary: 'configured workspace root with path protection, secret protection, policy boundaries, and trust envelope receipts',
  },
  approvalRequiredFor: [
    'RMT or financial/legal commitments',
    'private-data-sensitive exposure or sending',
    'destructive irreversible actions',
    'external commitments outside the ordinary workspace envelope',
    'missing provider setup that requires user configuration',
  ],
};

export const proactiveObservationProfile = {
  name: 'proactive_observation' as const,
  schedulerMode: 'observation' as const,
  allowedWithoutAdditionalApproval: {
    readOnlyRepoInspection: true,
    receiptAnalysis: true,
    internalDrafts: true,
    recommendationGeneration: true,
  },
  forbiddenActions: [
    'file edits',
    'shell side effects',
    'commits',
    'deletes',
    'external sends',
    'provider writes',
    'database migrations',
    'infrastructure changes',
  ],
};
