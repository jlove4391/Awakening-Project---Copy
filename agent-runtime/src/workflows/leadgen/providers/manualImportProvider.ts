import type { LeadRecord, LeadgenIcp } from '../types.js';

export async function sourceManualImportLeads(_icp: LeadgenIcp): Promise<LeadRecord[]> {
  return [];
}

export const manualImportLeadProvider = {
  id: 'manual_import',
  source: 'leadgen.workflow.manual_import_source',
  sourceLeads: sourceManualImportLeads,
} as const;
