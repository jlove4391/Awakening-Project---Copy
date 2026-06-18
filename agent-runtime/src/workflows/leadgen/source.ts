import { runtimeConfig } from '../../config.js';
import { sourceClayLeads } from './providers/clayProvider.js';
import { sourceManualImportLeads } from './providers/manualImportProvider.js';
import { sourceSheetsLeads } from './providers/sheetsProvider.js';
import { sourceSyntheticLeads } from './providers/syntheticProvider.js';
import { sourceWebResearchLeads } from './providers/webResearchProvider.js';
import type { LeadRecord, LeadgenIcp, LeadgenSourceMode } from './types.js';

export { atlasLeadProvider, sourceAtlasLeads } from './providers/atlasProvider.js';
export { clayLeadProvider, sourceClayLeads } from './providers/clayProvider.js';
export { manualImportLeadProvider, sourceManualImportLeads } from './providers/manualImportProvider.js';
export { manusResearchLeadProvider, sourceManusResearchLeads } from './providers/manusResearchProvider.js';
export { sheetsLeadProvider, sourceSheetsLeads } from './providers/sheetsProvider.js';
export { sourceSyntheticLeads, syntheticLeadProvider } from './providers/syntheticProvider.js';
export { webResearchLeadProvider, sourceWebResearchLeads } from './providers/webResearchProvider.js';

const sourceByMode: Record<LeadgenSourceMode, (icp: LeadgenIcp) => Promise<LeadRecord[]>> = {
  synthetic: sourceSyntheticLeads,
  sheets: sourceSheetsLeads,
  clay_direct: sourceClayLeads,
  clay_sheets: sourceClayLeads,
  manual: sourceManualImportLeads,
  web_research: sourceWebResearchLeads,
};

function text(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function normalizeSignals(value: LeadRecord['signals'], icp: LeadgenIcp) {
  const signals = Array.isArray(value) ? value.map(text).filter((signal): signal is string => Boolean(signal)) : [];
  if (signals.length) return [...new Set(signals)];
  return icp.buyingSignals.length ? icp.buyingSignals : ['matches ICP'];
}

export function normalizeLeadRecord(lead: LeadRecord, icp: LeadgenIcp, index: number, mode: LeadgenSourceMode): LeadRecord {
  const email = text(lead.email);
  const fullName = text(lead.fullName) || 'Unknown Contact';
  const company = text(lead.company) || (email ? email.split('@')[1] : 'Unknown Company');
  const market = text(lead.market) || icp.market;
  const updatedAt = text(lead.updatedAt) || new Date().toISOString();

  return {
    ...lead,
    id: text(lead.id) || `lead_${mode}_${index}`,
    fullName,
    title: text(lead.title) || (icp.titles.length ? icp.titles[0] : 'Decision Maker'),
    company,
    email,
    linkedinUrl: text(lead.linkedinUrl),
    geography: text(lead.geography) || (icp.geography === 'any geography' ? undefined : icp.geography),
    market,
    signals: normalizeSignals(lead.signals, icp),
    source: text(lead.source) || `leadgen.workflow.${mode}_source`,
    status: lead.status || 'discovered',
    updatedAt,
  };
}

export async function sourceLeadsForMode(icp: LeadgenIcp, mode: LeadgenSourceMode): Promise<LeadRecord[]> {
  const source = sourceByMode[mode];
  const leads = await source(icp);
  return leads.map((lead, index) => normalizeLeadRecord(lead, icp, index, mode)).slice(0, icp.limit);
}

export async function sourceLeads(icp: LeadgenIcp): Promise<LeadRecord[]> {
  return sourceLeadsForMode(icp, runtimeConfig.leadgenSourceMode);
}
