import { googleApiRequest, requireExplicitApproval, type ApprovalGateInput } from './auth.js';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const MULTIPART_BOUNDARY = 'agent-runtime-google-drive-boundary';

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

export async function searchDriveFiles(input: SearchFilesInput) {
  const params = new URLSearchParams({
    q: toDriveQuery(input.query),
    pageSize: String(input.maxResults || 20),
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink, parents, size)',
    orderBy: 'modifiedTime desc',
  });
  const response = await googleApiRequest<DriveListResponse>(`${DRIVE_API_BASE}/files?${params}`);
  return { ok: true, provider: 'google-drive', files: response.files || [] };
}

export async function createDriveTextFile(input: CreateTextFileInput) {
  const approvalBlock = requireExplicitApproval(input, 'drive.create_text_file');
  if (approvalBlock) return approvalBlock;

  const mimeType = input.mimeType || 'text/plain';
  const metadata = {
    name: input.name,
    mimeType,
    ...(input.parentId ? { parents: [input.parentId] } : {}),
  };
  const body = [
    `--${MULTIPART_BOUNDARY}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${MULTIPART_BOUNDARY}`,
    `Content-Type: ${mimeType}`,
    '',
    input.content,
    `--${MULTIPART_BOUNDARY}--`,
    '',
  ].join('\r\n');
  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id, name, mimeType, webViewLink, parents',
  });

  const response = await googleApiRequest<Record<string, any>>(`${DRIVE_UPLOAD_BASE}/files?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${MULTIPART_BOUNDARY}` },
    body,
  });

  return { ok: true, provider: 'google-drive', file: response };
}
