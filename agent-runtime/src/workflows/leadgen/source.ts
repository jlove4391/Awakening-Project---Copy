import { sourceSyntheticLeads } from './providers/syntheticProvider.js';
import type { LeadRecord, LeadgenIcp } from './types.js';

export { atlasLeadProvider, sourceAtlasLeads } from './providers/atlasProvider.js';
export { clayLeadProvider, sourceClayLeads } from './providers/clayProvider.js';
export { manualImportLeadProvider, sourceManualImportLeads } from './providers/manualImportProvider.js';
export { manusResearchLeadProvider, sourceManusResearchLeads } from './providers/manusResearchProvider.js';
export { sheetsLeadProvider, sourceSheetsLeads } from './providers/sheetsProvider.js';
export { sourceSyntheticLeads, syntheticLeadProvider } from './providers/syntheticProvider.js';
export { webResearchLeadProvider, sourceWebResearchLeads } from './providers/webResearchProvider.js';

export async function sourceLeads(icp: LeadgenIcp): Promise<LeadRecord[]> {
  return sourceSyntheticLeads(icp);
}
