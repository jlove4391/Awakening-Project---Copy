import type { ApprovalGateInput, LeadRecord } from './types.js';

export function campaignApprovalRequired(action = 'leadgen.export_sequence') {
  return {
    ok: false,
    status: 'approval_required',
    action,
    message: 'Campaign exports, CRM writes, and external sends require explicit user approval before execution.',
  };
}

export function approveCampaign(leads: LeadRecord[], input: ApprovalGateInput) {
  if (input.confirmedByUser !== true) return campaignApprovalRequired();
  return leads.map((lead) => ({ ...lead, status: 'approved' as const, updatedAt: new Date().toISOString() }));
}
