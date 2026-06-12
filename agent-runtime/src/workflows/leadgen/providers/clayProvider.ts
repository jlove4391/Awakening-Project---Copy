import type { LeadRecord, LeadgenIcp } from '../types.js';

export async function sourceClayLeads(_icp: LeadgenIcp): Promise<LeadRecord[]> {
  return [];
}

export const clayLeadProvider = {
  id: 'clay',
  source: 'leadgen.workflow.clay_source',
  sourceLeads: sourceClayLeads,
} as const;
