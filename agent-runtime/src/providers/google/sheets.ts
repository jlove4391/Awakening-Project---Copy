import { googleApiRequest, requireExplicitApproval, type ApprovalGateInput } from './auth.js';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';

export interface ReadRangeInput {
  spreadsheetId: string;
  range: string;
}

export interface UpdateRangeInput extends ApprovalGateInput {
  spreadsheetId: string;
  range: string;
  values: unknown[][];
}

interface SheetValuesResponse {
  range?: string;
  majorDimension?: string;
  values?: unknown[][];
}

export async function readSheetRange(input: ReadRangeInput) {
  const spreadsheetId = encodeURIComponent(input.spreadsheetId);
  const range = encodeURIComponent(input.range);
  const response = await googleApiRequest<SheetValuesResponse>(`${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}/values/${range}`);

  return {
    ok: true,
    provider: 'google-sheets',
    range: response.range,
    majorDimension: response.majorDimension,
    values: response.values || [],
  };
}

export async function updateSheetRange(input: UpdateRangeInput) {
  const approvalBlock = requireExplicitApproval(input, 'sheets.update_range');
  if (approvalBlock) return approvalBlock;

  const spreadsheetId = encodeURIComponent(input.spreadsheetId);
  const range = encodeURIComponent(input.range);
  const params = new URLSearchParams({ valueInputOption: 'RAW' });
  const response = await googleApiRequest<Record<string, any>>(`${SHEETS_API_BASE}/spreadsheets/${spreadsheetId}/values/${range}?${params}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: input.values }),
  });

  return { ok: true, provider: 'google-sheets', update: response };
}
