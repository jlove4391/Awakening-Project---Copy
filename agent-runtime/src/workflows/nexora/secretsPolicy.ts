import path from 'node:path';

export interface HighRiskSecretApproval {
  allowHighRiskSecretAccess?: boolean;
  highRiskSecretApprovalNote?: string;
}

const redaction = '[redacted-secret]';
const tokenStorePathPatterns = [
  /(^|\/)\.runtime-data\/(?:google-)?tokens?(?:\/|$)/i,
  /(^|\/)tokens?\.(?:json|db|sqlite|sqlite3)$/i,
  /(^|\/)oauth[-_]?tokens?(?:\.|\/|$)/i,
  /(^|\/)credentials?\.(?:json|ya?ml|env)$/i,
];
const blockedEnvFilePattern = /(^|\/)\.env(?:\.local)?$/i;
const envExamplePattern = /(^|\/)\.env\.example$/i;
const sensitiveKeyPattern = /(?:^|[_-])(api[_-]?key|secret|token|password|passwd|pwd|credential|private[_-]?key|refresh[_-]?token|access[_-]?token|client[_-]?secret|authorization|bearer)(?:$|[_-])/i;
const assignmentSecretPattern = /\b([A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY|REFRESH_TOKEN|ACCESS_TOKEN|CLIENT_SECRET)[A-Z0-9_]*)\s*=\s*([^\s#'\"]{8,}|['\"][^'\"]{8,}['\"])/gi;
const bearerPattern = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi;
const compactTokenPattern = /\b(?:sk|pk|ghp|github_pat|xox[baprs]|ya29|dop)_?[A-Za-z0-9_\-]{16,}\b/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const privateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const longSecretPattern = /\b[A-Za-z0-9+/=_-]{32,}\b/g;
const placeholderValuePattern = /^(|\s*|<[^>]+>|\$\{[^}]+}|your[-_\s]?[a-z0-9_\s-]*|example[-_\s]?[a-z0-9_\s-]*|changeme|replace_me|placeholder|todo|xxx+)$/i;

function normalizePolicyPath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/') || '.';
}

function hasHighRiskSecretApproval(input?: HighRiskSecretApproval) {
  return input?.allowHighRiskSecretAccess === true && Boolean(input.highRiskSecretApprovalNote?.trim());
}

export function redactTokenLikeValues<T>(value: T): T {
  if (typeof value === 'string') {
    return value
      .replace(privateKeyPattern, redaction)
      .replace(bearerPattern, redaction)
      .replace(jwtPattern, redaction)
      .replace(compactTokenPattern, redaction)
      .replace(assignmentSecretPattern, (_match, key) => `${key}=${redaction}`)
      .replace(longSecretPattern, (match) => (/\d/.test(match) && /[A-Za-z]/.test(match) ? redaction : match)) as T;
  }
  if (Array.isArray(value)) return value.map((entry) => redactTokenLikeValues(entry)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sensitiveKeyPattern.test(key) ? redaction : redactTokenLikeValues(nested),
      ]),
    ) as T;
  }
  return value;
}

export function redactForLogs<T>(value: T): T {
  return redactTokenLikeValues(value);
}

export function redactProviderReceiptPayload<T>(value: T): T {
  return redactTokenLikeValues(value);
}

export function assertSecretReadAllowed(relativePath: string, approval?: HighRiskSecretApproval) {
  const normalized = normalizePolicyPath(relativePath);
  if ((blockedEnvFilePattern.test(normalized) || tokenStorePathPatterns.some((pattern) => pattern.test(normalized))) && !hasHighRiskSecretApproval(approval)) {
    throw new Error('Secret policy blocked reading .env, .env.local, or token stores without allowHighRiskSecretAccess and highRiskSecretApprovalNote.');
  }
}

function envExampleContainsOnlyPlaceholders(content: string) {
  return content.split(/\r?\n/).every((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return true;
    const match = trimmed.match(/^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/);
    if (!match) return true;
    const value = match[1].trim().replace(/^['\"]|['\"]$/g, '');
    return placeholderValuePattern.test(value);
  });
}

export function contentContainsSecretLikeValue(content: string) {
  const patterns = [privateKeyPattern, bearerPattern, jwtPattern, compactTokenPattern, assignmentSecretPattern];
  return patterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  });
}

export function assertSecretWriteAllowed(relativePath: string, content: string, options: { isTracked?: boolean } = {}) {
  const normalized = normalizePolicyPath(relativePath);
  if (envExamplePattern.test(normalized)) {
    if (!envExampleContainsOnlyPlaceholders(content)) throw new Error('Secret policy allows .env.example updates only when values are placeholders.');
    return;
  }
  if (options.isTracked && contentContainsSecretLikeValue(content)) {
    throw new Error(`Secret policy blocked writing token-like secret values into tracked file ${normalized}. Use .env.example placeholders instead.`);
  }
}

export function isSecretPath(relativePath: string) {
  const normalized = normalizePolicyPath(relativePath);
  return blockedEnvFilePattern.test(normalized) || tokenStorePathPatterns.some((pattern) => pattern.test(normalized));
}

export function safeReceiptSummary(value: unknown) {
  const redacted = redactProviderReceiptPayload(value);
  if (typeof redacted === 'string') return redacted;
  try {
    return JSON.stringify(redacted);
  } catch (_error) {
    return 'Receipt payload could not be serialized.';
  }
}

export function policyRelativePath(root: string, target: string) {
  return normalizePolicyPath(path.relative(root, target) || '.');
}
