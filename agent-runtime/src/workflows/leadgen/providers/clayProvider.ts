import { createHash } from 'node:crypto';
import { sourceSheetsLeads } from './sheetsProvider.js';
import type { ReadRangeInput } from '../../../providers/google/sheets.js';
import type { LeadRecord, LeadgenIcp } from '../types.js';

const CLAY_LEAD_SOURCE = 'leadgen.workflow.clay_source';
const CLAY_DIRECT_INTEGRATION_PHASE = 'Phase 6';
const DEFAULT_CLAY_API_BASE_URL = 'https://api.clay.com/v1';

/**
 * Default Clay source flow remains:
 * 1. Build/enrich the lead list in Clay.
 * 2. Export or sync the Clay table into Google Sheets.
 * 3. Import that Google Sheets range through CORE using sheetsProvider.
 *
 * Direct Clay API/webhook sourcing is opt-in only. It is attempted when
 * ENABLE_DIRECT_CLAY_SOURCE=true and live Clay credentials plus a table,
 * endpoint, or webhook identifier are configured in the environment.
 */
const clayBridgeFlow = ['Clay table/export', 'Google Sheets', 'CORE import'] as const;
const clayDirectApiFlow = ['Clay API', 'CORE import'] as const;
const clayDirectWebhookFlow = ['Clay webhook', 'CORE import'] as const;

type ClaySheetBridgeInput = LeadgenIcp & Partial<ReadRangeInput> & {
  sheetRange?: string;
  sheetsRange?: string;
  sheetsSpreadsheetId?: string;
  spreadsheetRange?: string;
};

type ClayDirectMode = 'api' | 'webhook';

type ClayDirectConfig = {
  mode: ClayDirectMode;
  apiKey: string;
  workspaceId?: string;
  tableId?: string;
  endpoint?: string;
  webhookUrl?: string;
};

type ClayLeadRow = Record<string, unknown>;

export type ClayLeadProviderStatus = 'not_direct_yet' | 'delegated_to_sheets' | 'direct_api' | 'direct_webhook';

export interface ClayLeadProviderResult {
  ok: boolean;
  status: ClayLeadProviderStatus;
  provider: 'clay';
  source: typeof CLAY_LEAD_SOURCE;
  mode: 'sheet_bridge' | 'direct_api' | 'direct_webhook';
  flow: typeof clayBridgeFlow | typeof clayDirectApiFlow | typeof clayDirectWebhookFlow;
  leads: LeadRecord[];
  message: string;
  nextStep?: string;
  metadata: {
    directClayIntegration: boolean;
    directIntegrationReservedFor?: typeof CLAY_DIRECT_INTEGRATION_PHASE;
    sheetRangeProvided: boolean;
    delegatedProvider?: 'google_sheets';
    spreadsheetId?: string;
    range?: string;
    directMode?: ClayDirectMode;
    workspaceId?: string;
    tableId?: string;
    endpointConfigured?: boolean;
    webhookConfigured?: boolean;
  };
}

function configuredSheetRange(input: ClaySheetBridgeInput): ReadRangeInput | undefined {
  const spreadsheetId = input.spreadsheetId || input.sheetsSpreadsheetId || process.env.LEADGEN_GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = input.range || input.sheetRange || input.sheetsRange || input.spreadsheetRange || process.env.LEADGEN_GOOGLE_SHEETS_RANGE;

  if (!spreadsheetId || !range) return undefined;
  return { spreadsheetId, range };
}

function envFlagEnabled(value: string | undefined) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function configuredDirectClay(): ClayDirectConfig | undefined {
  if (!envFlagEnabled(process.env.ENABLE_DIRECT_CLAY_SOURCE)) return undefined;

  const apiKey = process.env.CLAY_API_KEY;
  if (!apiKey) return undefined;

  const workspaceId = process.env.CLAY_WORKSPACE_ID;
  const tableId = process.env.CLAY_TABLE_ID || process.env.CLAY_SOURCE_TABLE_ID;
  const endpoint = process.env.CLAY_API_LEADS_ENDPOINT || (workspaceId && tableId ? `${process.env.CLAY_API_BASE_URL || DEFAULT_CLAY_API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/tables/${encodeURIComponent(tableId)}/records` : undefined);
  const webhookUrl = process.env.CLAY_SOURCE_WEBHOOK_URL || process.env.CLAY_WEBHOOK_URL;

  if (endpoint) return { mode: 'api', apiKey, workspaceId, tableId, endpoint };
  if (webhookUrl) return { mode: 'webhook', apiKey, workspaceId, tableId, webhookUrl };
  return undefined;
}

function text(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function firstValue(row: ClayLeadRow, keys: string[]) {
  for (const key of keys) {
    const direct = text(row[key]);
    if (direct) return direct;
    const normalizedKey = Object.keys(row).find((candidate) => candidate.toLowerCase().replace(/[_-]+/g, ' ') === key.toLowerCase().replace(/[_-]+/g, ' '));
    if (normalizedKey) {
      const normalized = text(row[normalizedKey]);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function stableId(parts: string[]) {
  return `lead_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function clayRows(payload: unknown): ClayLeadRow[] {
  if (Array.isArray(payload)) return payload.filter((row): row is ClayLeadRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  if (!payload || typeof payload !== 'object') return [];

  const container = payload as Record<string, unknown>;
  for (const key of ['leads', 'records', 'rows', 'data', 'items']) {
    const value = container[key];
    if (Array.isArray(value)) return value.filter((row): row is ClayLeadRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
  }
  return [];
}

function leadFromClayRow(row: ClayLeadRow, icp: LeadgenIcp, index: number): LeadRecord | undefined {
  const email = firstValue(row, ['email', 'email address', 'work email']);
  const fullName = firstValue(row, ['fullName', 'full name', 'name', 'contact name', 'person']) || 'Unknown Contact';
  const company = firstValue(row, ['company', 'company name', 'account', 'organization']);

  if (!company && !email && fullName === 'Unknown Contact') return undefined;

  const scoreText = firstValue(row, ['score', 'lead score', 'fit score']);
  const score = scoreText === undefined ? undefined : Number(scoreText);
  const signalText = firstValue(row, ['signals', 'buying signals', 'notes', 'intent']);
  const signals = signalText
    ? signalText.split(/[;,|\n]/).map((signal) => signal.trim()).filter(Boolean)
    : icp.buyingSignals.length ? icp.buyingSignals : ['imported from Clay'];

  return {
    id: firstValue(row, ['id', 'lead id', 'record id']) || stableId([email || '', company || '', fullName, icp.market, String(index)]),
    fullName,
    title: firstValue(row, ['title', 'job title', 'role', 'position']) || (icp.titles.length ? icp.titles[0] : 'Decision Maker'),
    company: company || (email ? email.split('@')[1] : 'Unknown Company'),
    email,
    linkedinUrl: firstValue(row, ['linkedinUrl', 'linkedin url', 'linkedin', 'profile url']),
    geography: firstValue(row, ['geography', 'location', 'city', 'state', 'region', 'country']) || (icp.geography === 'any geography' ? undefined : icp.geography),
    market: firstValue(row, ['market', 'industry', 'vertical', 'sector']) || icp.market,
    signals: [...new Set(signals)],
    source: CLAY_LEAD_SOURCE,
    status: 'discovered',
    score: Number.isFinite(score) ? score : undefined,
    enrichment: { provider: 'clay', raw: row },
    updatedAt: new Date().toISOString(),
  } satisfies LeadRecord;
}

async function fetchDirectClayLeads(icp: LeadgenIcp, config: ClayDirectConfig) {
  const url = config.mode === 'api' ? config.endpoint : config.webhookUrl;
  if (!url) return [];

  const init: RequestInit = config.mode === 'api'
    ? { headers: { Authorization: `Bearer ${config.apiKey}`, 'x-api-key': config.apiKey, Accept: 'application/json' } }
    : {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ workspaceId: config.workspaceId, tableId: config.tableId, icp, limit: icp.limit }),
      };

  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Clay ${config.mode} source request failed with ${response.status} ${response.statusText}`);

  const payload = await response.json() as unknown;
  return clayRows(payload)
    .map((row, index) => leadFromClayRow(row, icp, index))
    .filter((lead): lead is LeadRecord => Boolean(lead))
    .slice(0, icp.limit);
}

export async function sourceClayLeadsWithStatus(icp: LeadgenIcp): Promise<ClayLeadProviderResult> {
  const directClay = configuredDirectClay();

  if (directClay) {
    const leads = await fetchDirectClayLeads(icp, directClay);
    return {
      ok: true,
      status: directClay.mode === 'api' ? 'direct_api' : 'direct_webhook',
      provider: 'clay',
      source: CLAY_LEAD_SOURCE,
      mode: directClay.mode === 'api' ? 'direct_api' : 'direct_webhook',
      flow: directClay.mode === 'api' ? clayDirectApiFlow : clayDirectWebhookFlow,
      leads,
      message: `Clay direct ${directClay.mode} source flow used because ENABLE_DIRECT_CLAY_SOURCE=true and Clay configuration is present.`,
      metadata: {
        directClayIntegration: true,
        sheetRangeProvided: Boolean(configuredSheetRange(icp as ClaySheetBridgeInput)),
        directMode: directClay.mode,
        workspaceId: directClay.workspaceId,
        tableId: directClay.tableId,
        endpointConfigured: Boolean(directClay.endpoint),
        webhookConfigured: Boolean(directClay.webhookUrl),
      },
    };
  }

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
      message: 'Clay direct API/webhook sourcing is disabled or missing configuration. Export or sync the Clay table to Google Sheets, then provide a spreadsheetId and range for CORE import.',
      nextStep: 'To keep the default path, provide spreadsheetId + range or LEADGEN_GOOGLE_SHEETS_SPREADSHEET_ID + LEADGEN_GOOGLE_SHEETS_RANGE. To opt into direct Clay, set ENABLE_DIRECT_CLAY_SOURCE=true with CLAY_API_KEY and CLAY_API_LEADS_ENDPOINT, CLAY_TABLE_ID, or CLAY_SOURCE_WEBHOOK_URL.',
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
    message: 'Clay source flow delegated to sheetsProvider by default: Clay table/export → Google Sheets → CORE import.',
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
  directApiFlow: clayDirectApiFlow,
  directWebhookFlow: clayDirectWebhookFlow,
  directIntegrationReservedFor: CLAY_DIRECT_INTEGRATION_PHASE,
} as const;
