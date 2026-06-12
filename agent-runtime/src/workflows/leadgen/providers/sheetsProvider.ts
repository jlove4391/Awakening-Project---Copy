import type { LeadRecord, LeadgenIcp } from '../types.js';

export async function sourceSheetsLeads(_icp: LeadgenIcp): Promise<LeadRecord[]> {
  return [];
}

export const sheetsLeadProvider = {
  id: 'sheets',
  source: 'leadgen.workflow.sheets_source',
  sourceLeads: sourceSheetsLeads,
} as const;
