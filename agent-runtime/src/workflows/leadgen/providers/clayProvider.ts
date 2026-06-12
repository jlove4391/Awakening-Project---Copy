import { sourceSheetsLeads } from './sheetsProvider.js';
import type { ReadRangeInput } from '../../../providers/google/sheets.js';
import type { LeadRecord, LeadgenIcp } from '../types.js';

const CLAY_LEAD_SOURCE = 'leadgen.workflow.clay_source';
const CLAY_DIRECT_INTEGRATION_PHASE = 'Phase 6';

/**
 * Clay v1 intentionally does not call Clay APIs or webhooks directly.
 *
 * Supported flow:
 * 1. Build/enrich the lead list in Clay.
 * 2. Export or sync the Clay table into Google Sheets.
 * 3. Import that Google Sheets range through CORE using sheetsProvider.
 *
 * Direct Clay API/webhook integration is reserved for a later Phase 6 task.
 */
const clayBridgeFlow = ['Clay table/export', 'Google Sheets', 'CORE import'] as const;

type ClaySheetBridgeInput = LeadgenIcp & Partial<ReadRangeInput> & {
  sheetRange?: string;
  sheetsRange?: string;
  sheetsSpreadsheetId?: string;
  spreadsheetRange?: string;
};

export type ClayLeadProviderStatus = 'not_direct_yet' | 'delegated_to_sheets';

export interface ClayLeadProviderResult {
  ok: boolean;
  status: ClayLeadProviderStatus;
  provider: 'clay';
  source: typeof CLAY_LEAD_SOURCE;
  mode: 'sheet_bridge';
  flow: typeof clayBridgeFlow;
  leads: LeadRecord[];
  message: string;
  nextStep?: string;
  metadata: {
    directClayIntegration: false;
    directIntegrationReservedFor: typeof CLAY_DIRECT_INTEGRATION_PHASE;
    sheetRangeProvided: boolean;
    delegatedProvider?: 'google_sheets';
    spreadsheetId?: string;
    range?: string;
  };
}

function configuredSheetRange(input: ClaySheetBridgeInput): ReadRangeInput | undefined {
  const spreadsheetId = input.spreadsheetId || input.sheetsSpreadsheetId || process.env.LEADGEN_GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = input.range || input.sheetRange || input.sheetsRange || input.spreadsheetRange || process.env.LEADGEN_GOOGLE_SHEETS_RANGE;

  if (!spreadsheetId || !range) return undefined;
  return { spreadsheetId, range };
}

export async function sourceClayLeadsWithStatus(icp: LeadgenIcp): Promise<ClayLeadProviderResult> {
  const sheetRange = configuredSheetRange(icp as ClaySheetBridgeInput);

  if (!sheetRange) {
    return {
      ok: false,
      status: 'not_direct_yet',
      provider: 'clay',
      source: CLAY_LEAD_SOURCE,
      mode: 'sheet_bridge',
      flow: clayBridgeFlow,
      leads: [],
      message: 'Clay direct API/webhook sourcing is not enabled in v1. Export or sync the Clay table to Google Sheets, then provide a spreadsheetId and range for CORE import.',
      nextStep: 'Provide spreadsheetId + range, sheetRange/sheetsRange, or LEADGEN_GOOGLE_SHEETS_SPREADSHEET_ID + LEADGEN_GOOGLE_SHEETS_RANGE.',
      metadata: {
        directClayIntegration: false,
        directIntegrationReservedFor: CLAY_DIRECT_INTEGRATION_PHASE,
        sheetRangeProvided: false,
      },
    };
  }

  const leads = await sourceSheetsLeads(icp);

  return {
    ok: true,
    status: 'delegated_to_sheets',
    provider: 'clay',
    source: CLAY_LEAD_SOURCE,
    mode: 'sheet_bridge',
    flow: clayBridgeFlow,
    leads,
    message: 'Clay v1 source flow delegated to sheetsProvider: Clay table/export → Google Sheets → CORE import.',
    metadata: {
      directClayIntegration: false,
      directIntegrationReservedFor: CLAY_DIRECT_INTEGRATION_PHASE,
      sheetRangeProvided: true,
      delegatedProvider: 'google_sheets',
      spreadsheetId: sheetRange.spreadsheetId,
      range: sheetRange.range,
    },
  };
}

export async function sourceClayLeads(icp: LeadgenIcp): Promise<LeadRecord[]> {
  const result = await sourceClayLeadsWithStatus(icp);
  return result.leads;
}

export const clayLeadProvider = {
  id: 'clay',
  source: CLAY_LEAD_SOURCE,
  sourceLeads: sourceClayLeads,
  sourceLeadsWithStatus: sourceClayLeadsWithStatus,
  statusWhenDirectRequested: 'not_direct_yet',
  flow: clayBridgeFlow,
  directIntegrationReservedFor: CLAY_DIRECT_INTEGRATION_PHASE,
} as const;
