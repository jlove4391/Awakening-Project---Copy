import { promises as fs } from 'node:fs';
import path from 'node:path';
import { decidePolicy } from '../../governance/policyDecision.js';
import { googleApiRequest, requirePolicyApproval, type ApprovalGateInput } from './auth.js';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MULTIPART_BOUNDARY = 'agent-runtime-google-drive-boundary';
const WORKSPACE_CONTENT_PREFIX = '@workspace-file:';
const MAX_WORKSPACE_CONTENT_BYTES = 1_000_000;

export interface SearchFilesInput {
  query?: string;
  maxResults?: number;
}

export interface CreateTextFileInput extends ApprovalGateInput {
  name: string;
  parentId?: string;
  content: string;
  mimeType?: string;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function toDriveQuery(query: string | undefined) {
  const trimmed = (query || '').trim();
  if (!trimmed) return 'trashed = false';
  if (/\b(name|mimeType|fullText|modifiedTime|trashed|parents)\b\s*(=|!=|contains|in|>|<)/i.test(trimmed)) {
    return trimmed.includes('trashed') ? trimmed : `(${trimmed}) and trashed = false`;
  }
  return `name contains '${escapeDriveQueryValue(trimmed)}' and trashed = false`;
}

interface DriveListResponse {
  files?: Array<Record<string, any>>;
}

function driveSetupRequired(error: unknown) {
  const providerMessage = error instanceof Error ? error.message : String(error);
  if (!/not configured|not connected|oauth|access token|refresh token|client secret|invalid_grant|authorize the runtime/i.test(providerMessage)) return undefined;
  return {
    ok: false,
    status: 'provider_not_configured',
    provider: 'google-drive',
    message: `Provider configuration missing: ${providerMessage}`,
    setup: {
      required: true,
      startPath: '/api/auth/google/start',
      statusPath: '/api/auth/google/status',
    },
  };
}

function workspaceRoot() {
  return path.resolve(process.env.NEXORA_WORKSPACE_ROOT || process.env.CODE_WORKSPACE_ROOT || process.cwd());
}

async function resolveDriveContent(content: string) {
  if (!content.startsWith(WORKSPACE_CONTENT_PREFIX)) return content;
  const relativePath = content.slice(WORKSPACE_CONTENT_PREFIX.length).trim().replace(/\\/g, '/');
  if (!relativePath || path.isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith('../') || relativePath.includes('/../')) {
    throw new Error('Drive workspace content reference must be a bounded workspace-relative path.');
  }
  const root = workspaceRoot();
  const target = path.resolve(root, relativePath);
  const lexicalRelative = path.relative(root, target);
  if (!lexicalRelative || lexicalRelative.startsWith('..') || path.isAbsolute(lexicalRelative)) {
    throw new Error('Drive workspace content reference escaped the configured workspace root.');
  }
  const [realRoot, realTarget, targetStat] = await Promise.all([
    fs.realpath(root),
    fs.realpath(target),
    fs.stat(target),
  ]);
  const resolvedRelative = path.relative(realRoot, realTarget);
  if (resolvedRelative.startsWith('..') || path.isAbsolute(resolvedRelative)) {
    throw new Error('Drive workspace content reference resolved outside the configured workspace root.');
  }
  if (!targetStat.isFile()) throw new Error('Drive workspace content reference must point to a regular file.');
  if (targetStat.size > MAX_WORKSPACE_CONTENT_BYTES) {
    throw new Error(`Drive workspace content reference exceeds ${MAX_WORKSPACE_CONTENT_BYTES} bytes.`);
  }
  return fs.readFile(realTarget, 'utf8');
}

export async function searchDriveFiles(input: SearchFilesInput) {
  const params = new URLSearchParams({
    q: toDriveQuery(input.query),
    pageSize: String(input.maxResults || 20),
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink, parents, size)',
    orderBy: 'modifiedTime desc',
  });
  try {
    const response = await googleApiRequest<DriveListResponse>(`${DRIVE_API_BASE}/files?${params}`);
    return { ok: true, provider: 'google-drive', files: response.files || [] };
  } catch (error) {
    const setupRequired = driveSetupRequired(error);
    if (setupRequired) return setupRequired;
    throw error;
  }
}

export function classifyDriveTextFilePolicy(input: CreateTextFileInput) {
  return decidePolicy({
    category: 'drive',
    action: 'create_text_file',
    riskLevel: 'write',
    input: { name: input.name, parentId: input.parentId, content: input.content, mimeType: input.mimeType },
  });
}

export async function createDriveTextFile(input: CreateTextFileInput) {
  const policyDecision = classifyDriveTextFilePolicy(input);
  const approvalBlock = requirePolicyApproval(input, 'drive.create_text_file', policyDecision);
  if (approvalBlock) return approvalBlock;

  const mimeType = input.mimeType || 'text/plain';
  const metadata = {
    name: input.name,
    mimeType,
    ...(input.parentId ? { parents: [input.parentId] } : {}),
  };
  const resolvedContent = await resolveDriveContent(input.content);
  const body = [
    `--${MULTIPART_BOUNDARY}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${MULTIPART_BOUNDARY}`,
    `Content-Type: ${mimeType}`,
    '',
    resolvedContent,
    `--${MULTIPART_BOUNDARY}--`,
    '',
  ].join('\r\n');
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id, name, mimeType, webViewLink, parents',
  });

  try {
    const response = await googleApiRequest<Record<string, any>>(`${DRIVE_UPLOAD_BASE}/files?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
      body,
    });
    return { ok: true, provider: 'google-drive', file: response };
  } catch (error) {
    const setupRequired = driveSetupRequired(error);
    if (setupRequired) return setupRequired;
    throw error;
  }
}
