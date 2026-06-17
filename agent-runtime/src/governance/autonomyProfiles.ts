import path from 'node:path';
import type { RegisteredToolDefinition } from '../tools/registry.js';

export type AutonomyProfileName = 'dev_autonomy';

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
  return value === 'dev_autonomy';
}

export function devAutonomyAllowsWithoutApproval(definition: RegisteredToolDefinition, input: Record<string, unknown>) {
  if (definition.riskLevel === 'read') return true;
  if (DEV_AUTONOMY_WEB_TOOLS.has(definition.name)) return true;

  if (definition.name === 'code.create_file') {
    return isApprovedSandboxPath(input.path) && !isSourceOrPackagePath(input.path);
  }

  return false;
}

export function requiresApprovalForAutonomyProfile(
  profile: AutonomyProfileName | undefined,
  definition: RegisteredToolDefinition,
  input: Record<string, unknown>,
) {
  if (profile !== 'dev_autonomy') return definition.humanApprovalRequired;
  return !devAutonomyAllowsWithoutApproval(definition, input);
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
