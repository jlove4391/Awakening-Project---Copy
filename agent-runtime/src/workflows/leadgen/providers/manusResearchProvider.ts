import type { LeadRecord, LeadgenIcp } from '../types.js';

export async function sourceManusResearchLeads(_icp: LeadgenIcp): Promise<LeadRecord[]> {
  return [];
}

export const manusResearchLeadProvider = {
  id: 'manus_research',
  source: 'leadgen.workflow.manus_research_source',
  sourceLeads: sourceManusResearchLeads,
} as const;
