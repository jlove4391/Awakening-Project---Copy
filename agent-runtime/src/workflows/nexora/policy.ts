export interface NexoraPolicy {
  allowedRoots: string[];
  protectedPaths: string[];
  maxChangedFiles: number;
  maxDiffSizeBytes: number;
  maxCommandTimeoutMs: number;
  allowedCommandPrefixes: string[];
  requireTestsBeforeCompletion: boolean;
  requireApprovalBeforeCommit: boolean;
  requireApprovalBeforeDependencyInstall: boolean;
  requireApprovalBeforeDeletion: boolean;
  requireApprovalBeforeProviderDatabankMutation: boolean;
}

type NexoraPolicyEnvKey =
  | 'NEXORA_ALLOWED_ROOTS'
  | 'NEXORA_PROTECTED_PATHS'
  | 'NEXORA_MAX_CHANGED_FILES'
  | 'NEXORA_MAX_DIFF_SIZE_BYTES'
  | 'NEXORA_MAX_COMMAND_TIMEOUT_MS'
  | 'NEXORA_ALLOWED_COMMAND_PREFIXES'
  | 'NEXORA_REQUIRE_TESTS_BEFORE_COMPLETION'
  | 'NEXORA_REQUIRE_APPROVAL_BEFORE_COMMIT'
  | 'NEXORA_REQUIRE_APPROVAL_BEFORE_DEPENDENCY_INSTALL'
  | 'NEXORA_REQUIRE_APPROVAL_BEFORE_DELETION'
  | 'NEXORA_REQUIRE_APPROVAL_BEFORE_PROVIDER_DATABANK_MUTATION'
;

type PolicyEnv = Partial<Record<NexoraPolicyEnvKey, string>>;

const defaultMaxChangedFiles = 25;
const defaultMaxDiffSizeBytes = 250_000;
const defaultMaxCommandTimeoutMs = 120_000;

export const defaultNexoraPolicy: NexoraPolicy = {
  allowedRoots: ['.'],
  protectedPaths: [
    '.git',
    '.env',
    '.runtime-data',
    'node_modules',
    'dist',
    'build',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
  ],
  maxChangedFiles: defaultMaxChangedFiles,
  maxDiffSizeBytes: defaultMaxDiffSizeBytes,
  maxCommandTimeoutMs: defaultMaxCommandTimeoutMs,
  allowedCommandPrefixes: [
    'npm run',
    'pnpm run',
    'yarn run',
    'bun run',
    'npx tsc',
    'npx eslint',
    'git diff',
    'git status',
  ],
  requireTestsBeforeCompletion: true,
  requireApprovalBeforeCommit: true,
  requireApprovalBeforeDependencyInstall: true,
  requireApprovalBeforeDeletion: true,
  requireApprovalBeforeProviderDatabankMutation: true,
};

function parseCsv(value?: string) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePolicyPath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '') || '.';
}

function isSafeRelativePath(value: string) {
  const normalized = normalizePolicyPath(value);
  return normalized === '.' || (!normalized.startsWith('/') && !normalized.split('/').includes('..'));
}

function isPathWithinRoot(candidate: string, root: string) {
  const normalizedCandidate = normalizePolicyPath(candidate);
  const normalizedRoot = normalizePolicyPath(root);
  return normalizedRoot === '.'
    || normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function parseSafePositiveInteger(value: string | undefined, defaultValue: number) {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, defaultValue);
}

function parseSafeRequiredBoolean(value: string | undefined, defaultValue: boolean) {
  if (defaultValue) return true;
  return value?.toLowerCase() === 'true';
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function safeAllowedRoots(defaults: string[], override?: string) {
  const requested = parseCsv(override)
    .map(normalizePolicyPath)
    .filter(isSafeRelativePath)
    .filter((candidate) => defaults.some((root) => isPathWithinRoot(candidate, root)));

  return requested.length ? unique(requested) : defaults;
}

function safeProtectedPaths(defaults: string[], override?: string) {
  const additional = parseCsv(override)
    .map(normalizePolicyPath)
    .filter(isSafeRelativePath);

  return unique([...defaults, ...additional]);
}

function safeAllowedCommandPrefixes(defaults: string[], override?: string) {
  const requested = parseCsv(override);
  if (!requested.length) return defaults;

  const allowed = requested.filter((prefix) => defaults.includes(prefix));
  return allowed.length ? unique(allowed) : defaults;
}

export function loadNexoraPolicy(env: PolicyEnv = process.env, defaults: NexoraPolicy = defaultNexoraPolicy): NexoraPolicy {
  return {
    allowedRoots: safeAllowedRoots(defaults.allowedRoots, env.NEXORA_ALLOWED_ROOTS),
    protectedPaths: safeProtectedPaths(defaults.protectedPaths, env.NEXORA_PROTECTED_PATHS),
    maxChangedFiles: parseSafePositiveInteger(env.NEXORA_MAX_CHANGED_FILES, defaults.maxChangedFiles),
    maxDiffSizeBytes: parseSafePositiveInteger(env.NEXORA_MAX_DIFF_SIZE_BYTES, defaults.maxDiffSizeBytes),
    maxCommandTimeoutMs: parseSafePositiveInteger(env.NEXORA_MAX_COMMAND_TIMEOUT_MS, defaults.maxCommandTimeoutMs),
    allowedCommandPrefixes: safeAllowedCommandPrefixes(defaults.allowedCommandPrefixes, env.NEXORA_ALLOWED_COMMAND_PREFIXES),
    requireTestsBeforeCompletion: parseSafeRequiredBoolean(env.NEXORA_REQUIRE_TESTS_BEFORE_COMPLETION, defaults.requireTestsBeforeCompletion),
    requireApprovalBeforeCommit: parseSafeRequiredBoolean(env.NEXORA_REQUIRE_APPROVAL_BEFORE_COMMIT, defaults.requireApprovalBeforeCommit),
    requireApprovalBeforeDependencyInstall: parseSafeRequiredBoolean(env.NEXORA_REQUIRE_APPROVAL_BEFORE_DEPENDENCY_INSTALL, defaults.requireApprovalBeforeDependencyInstall),
    requireApprovalBeforeDeletion: parseSafeRequiredBoolean(env.NEXORA_REQUIRE_APPROVAL_BEFORE_DELETION, defaults.requireApprovalBeforeDeletion),
    requireApprovalBeforeProviderDatabankMutation: parseSafeRequiredBoolean(env.NEXORA_REQUIRE_APPROVAL_BEFORE_PROVIDER_DATABANK_MUTATION, defaults.requireApprovalBeforeProviderDatabankMutation),
  };
}

export const nexoraPolicy = loadNexoraPolicy();
