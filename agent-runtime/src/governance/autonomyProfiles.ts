import path from 'node:path';
import type { RegisteredToolDefinition } from '../tools/registry.js';
import type { ExecutionMode } from '../types.js';

export type AutonomyProfileName = 'dev_autonomy' | 'proactive_observation';

const AUTONOMOUS_MUTATION_SCOPES = new Set([
  'repo.write',
  'repo.delete',
  'repo.command',
  'repo.commit',
  'provider.create',
  'provider.update',
  'provider.delete',
  'database.migrate',
  'external.send',
]);

const DEV_AUTONOMY_SANDBOX_ROOTS = ['.runtime-data/dev-autonomy', 'sandbox/dev-autonomy'];
const DEV_AUTONOMY_WEB_TOOLS = new Set(['web.fetch_url', 'web.crawl_site']);
const SOURCE_OR_PACKAGE_PATTERNS = [
  /(^|\/)src\//,
  /(^|\/)package\.json$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)yarn\.lock$/,
];

function normalizeWorkspacePath(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isApprovedSandboxPath(value: unknown) {
  const normalized = normalizeWorkspacePath(value);
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) return false;
  return DEV_AUTONOMY_SANDBOX_ROOTS.some((root) => normalized === root || normalized.startsWith(`${root}/`));
}

function isSourceOrPackagePath(value: unknown) {
  const normalized = normalizeWorkspacePath(value);
  return SOURCE_OR_PACKAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isKnownAutonomyProfile(value: unknown): value is AutonomyProfileName {
  return value === 'dev_autonomy' || value === 'proactive_observation';
}

export function devAutonomyAllowsWithoutApproval(definition: RegisteredToolDefinition, input: Record<string, unknown>) {
  if (definition.riskLevel === 'read') return true;
  if (DEV_AUTONOMY_WEB_TOOLS.has(definition.name)) return true;

  if (definition.name === 'code.create_file') {
    return isApprovedSandboxPath(input.path) && !isSourceOrPackagePath(input.path);
  }

  return false;
}

export function proactiveObservationAllows(definition: RegisteredToolDefinition) {
  if (definition.name === 'observation.recommend') return true;
  return definition.riskLevel === 'read';
}

export function requiresApprovalForAutonomyProfile(
  profile: AutonomyProfileName | undefined,
  definition: RegisteredToolDefinition,
  input: Record<string, unknown>,
) {
  if (profile === 'proactive_observation') return !proactiveObservationAllows(definition);
  if (profile !== 'dev_autonomy') return definition.humanApprovalRequired;
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
  if (mode === 'observation' || profile === 'proactive_observation') return !proactiveObservationAllows(definition);
  if (mode !== 'autonomous') return false;
  if (definition.riskLevel === 'read') return false;
  if (profile === 'dev_autonomy') return requiresApprovalForAutonomyProfile(profile, definition, input);
  return definition.humanApprovalRequired || (approvalScope ? AUTONOMOUS_MUTATION_SCOPES.has(approvalScope) : true);
}

export const devAutonomyProfile = {
  name: 'dev_autonomy' as const,
  allowedWithoutAdditionalApproval: {
    readOnlyInspection: true,
    webTools: [...DEV_AUTONOMY_WEB_TOOLS],
    internalDrafts: true,
    sandboxFileCreationRoots: DEV_AUTONOMY_SANDBOX_ROOTS,
  },
  approvalRequiredFor: [
    'src edits',
    'package edits',
    'shell commands',
    'deletes',
    'commits',
    'external sends',
    'provider writes',
    'database migrations',
    'purchases',
    'infrastructure actions',
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
