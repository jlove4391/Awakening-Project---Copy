import { createHash } from 'node:crypto';
import { readSheetRange } from '../../../providers/google/sheets.js';
import type { ReadRangeInput } from '../../../providers/google/sheets.js';
import type { LeadRecord, LeadgenIcp } from '../types.js';

const GOOGLE_SHEETS_LEAD_SOURCE = 'leadgen.workflow.google_sheets_source';
const DEFAULT_TITLE = 'Decision Maker';

type SheetLeadInput = LeadgenIcp & Partial<ReadRangeInput> & {
  sheetRange?: string;
  sheetsRange?: string;
  sheetsSpreadsheetId?: string;
  spreadsheetRange?: string;
};

type RowLookup = Record<string, unknown>;

const headerAliases = {
  company: ['company', 'company name', 'business', 'business name', 'organization', 'account', 'account name'],
  fullName: ['contact', 'contact name', 'name', 'full name', 'person', 'lead name'],
  firstName: ['first name', 'firstname', 'given name'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  title: ['title', 'job title', 'role', 'position'],
  email: ['email', 'email address', 'work email'],
  phone: ['phone', 'phone number', 'mobile', 'mobile phone', 'telephone'],
  website: ['website', 'website url', 'domain', 'company website', 'url'],
  market: ['industry', 'market', 'vertical', 'sector', 'category'],
  geography: ['geography', 'location', 'city', 'state', 'region', 'country', 'territory'],
  source: ['source', 'lead source', 'origin'],
  linkedinUrl: ['linkedin', 'linkedin url', 'linkedin profile', 'profile url'],
  signals: ['signals', 'buying signals', 'signal', 'notes', 'intent'],
  score: ['score', 'lead score', 'fit score'],
  confidence: ['confidence', 'confidence score', 'confidence level', 'email confidence'],
  confidenceReason: ['confidence reason', 'confidence notes', 'confidence rationale'],
} as const;

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function stableId(parts: string[]) {
  return `lead_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

function parseNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizeText(value)?.replace(/%$/, '');
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSignals(value: unknown, icp: LeadgenIcp) {
  const explicitSignals = normalizeText(value)
    ?.split(/[;,|\n]/)
    .map((signal) => signal.trim())
    .filter(Boolean);

  if (explicitSignals?.length) return [...new Set(explicitSignals)];
  if (icp.buyingSignals.length) return icp.buyingSignals;
  return ['imported from Google Sheets'];
}

function valueFor(row: RowLookup, field: keyof typeof headerAliases) {
  for (const alias of headerAliases[field]) {
    const value = row[alias];
    if (normalizeText(value)) return value;
  }

  return undefined;
}

function rowsToLookups(values: unknown[][]) {
  if (!values.length) return [];

  const headers = values[0].map(normalizeHeader);
  const hasHeaders = headers.some((header) => Object.values(headerAliases).some((aliases) => (aliases as readonly string[]).includes(header)));
  const dataRows = hasHeaders ? values.slice(1) : values;
  const effectiveHeaders = hasHeaders
    ? headers
    : ['company name', 'contact name', 'email', 'phone', 'website', 'industry', 'geography', 'source'];

  return dataRows.map((row) =>
    effectiveHeaders.reduce<RowLookup>((lookup, header, index) => {
      if (header) lookup[header] = row[index];
      return lookup;
    }, {}),
  );
}

function leadFromRow(row: RowLookup, icp: LeadgenIcp, index: number): LeadRecord | undefined {
  const firstName = normalizeText(valueFor(row, 'firstName'));
  const lastName = normalizeText(valueFor(row, 'lastName'));
  const fullName = normalizeText(valueFor(row, 'fullName')) || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Contact';
  const company = normalizeText(valueFor(row, 'company'));
  const email = normalizeText(valueFor(row, 'email'));

  if (!company && !email && fullName === 'Unknown Contact') return undefined;

  const market = normalizeText(valueFor(row, 'market')) || icp.market;
  const geography = normalizeText(valueFor(row, 'geography')) || (icp.geography === 'any geography' ? undefined : icp.geography);
  const title = normalizeText(valueFor(row, 'title')) || (icp.titles.length ? icp.titles[0] : DEFAULT_TITLE);
  const phone = normalizeText(valueFor(row, 'phone'));
  const website = normalizeText(valueFor(row, 'website'));
  const sheetSource = normalizeText(valueFor(row, 'source'));
  const confidence = parseNumber(valueFor(row, 'confidence'));
  const confidenceReason = normalizeText(valueFor(row, 'confidenceReason'));
  const score = parseNumber(valueFor(row, 'score'));
  const id = stableId([email || '', company || '', fullName, market, String(index)]);

  return {
    id,
    fullName,
    title,
    company: company || (email ? email.split('@')[1] : 'Unknown Company'),
    email,
    linkedinUrl: normalizeText(valueFor(row, 'linkedinUrl')),
    geography,
    market,
    signals: parseSignals(valueFor(row, 'signals'), icp),
    source: GOOGLE_SHEETS_LEAD_SOURCE,
    status: 'discovered',
    score,
    scoreReasons: confidenceReason ? [confidenceReason] : undefined,
    enrichment: {
      provider: 'google-sheets',
      sheetSource,
      phone,
      website,
      confidence,
      confidenceReason,
    },
    updatedAt: new Date().toISOString(),
  } satisfies LeadRecord;
}

function configuredSheetRange(input: SheetLeadInput): ReadRangeInput | undefined {
  const spreadsheetId = input.spreadsheetId || input.sheetsSpreadsheetId || process.env.LEADGEN_GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = input.range || input.sheetRange || input.sheetsRange || input.spreadsheetRange || process.env.LEADGEN_GOOGLE_SHEETS_RANGE;

  if (!spreadsheetId || !range) return undefined;
  return { spreadsheetId, range };
}

export async function sourceSheetsLeads(icp: LeadgenIcp): Promise<LeadRecord[]> {
  const sheetRange = configuredSheetRange(icp as SheetLeadInput);
  if (!sheetRange) return [];

  const sheet = await readSheetRange(sheetRange);
  return rowsToLookups(sheet.values)
    .map((row, index) => leadFromRow(row, icp, index))
    .filter((lead): lead is LeadRecord => Boolean(lead))
    .slice(0, icp.limit);
}

export const sheetsLeadProvider = {
  id: 'google_sheets',
  source: GOOGLE_SHEETS_LEAD_SOURCE,
  sourceLeads: sourceSheetsLeads,
} as const;
