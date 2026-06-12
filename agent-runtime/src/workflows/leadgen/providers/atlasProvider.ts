import type { LeadRecord, LeadgenIcp } from '../types.js';

export async function sourceAtlasLeads(_icp: LeadgenIcp): Promise<LeadRecord[]> {
  return [];
}

export const atlasLeadProvider = {
  id: 'atlas',
  source: 'leadgen.workflow.atlas_source',
  sourceLeads: sourceAtlasLeads,
} as const;
