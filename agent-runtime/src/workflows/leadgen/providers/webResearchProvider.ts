import type { LeadRecord, LeadgenIcp } from '../types.js';

export async function sourceWebResearchLeads(_icp: LeadgenIcp): Promise<LeadRecord[]> {
  return [];
}

export const webResearchLeadProvider = {
  id: 'web_research',
  source: 'leadgen.workflow.web_research_source',
  sourceLeads: sourceWebResearchLeads,
} as const;
