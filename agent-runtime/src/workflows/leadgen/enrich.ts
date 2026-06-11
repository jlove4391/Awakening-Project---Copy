import { enrichPersonWithClay, type EnrichPersonInput } from '../../providers/clay/index.js';
import { remember } from '../../memory/index.js';
import type { LeadRecord, LeadgenStepContext, ApprovalGateInput } from './types.js';

export function enrichmentApprovalRequired() {
  return {
    ok: false,
    status: 'approval_required',
    action: 'leadgen.enrich',
    message: 'Enrichment purchases require explicit approval before any Clay/enrichment adapter is called.',
  };
}

export async function enrichLead(lead: LeadRecord, input: ApprovalGateInput, context: LeadgenStepContext): Promise<LeadRecord | ReturnType<typeof enrichmentApprovalRequired>> {
  if (input.confirmedByUser !== true) return enrichmentApprovalRequired();
  const enrichmentInput: EnrichPersonInput = {
    email: lead.email || '',
    linkedinUrl: lead.linkedinUrl || '',
    fullName: lead.fullName,
    company: lead.company,
    confirmedByUser: input.confirmedByUser,
    approvalNote: input.approvalNote,
  };
  const result = await enrichPersonWithClay(enrichmentInput, context);
  if (!result.ok || !('enrichment' in result)) return enrichmentApprovalRequired();
  const enrichedLead = {
    ...lead,
    enrichment: result.enrichment,
    status: 'enriched' as const,
    updatedAt: new Date().toISOString(),
  };
  await remember(context.sessionId, `Lead ${enrichedLead.fullName} at ${enrichedLead.company} enriched; status=${enrichedLead.status}; score=${enrichedLead.score ?? 'n/a'}`, {
    id: enrichedLead.id,
    scope: 'leads',
    tags: ['leadgen', 'enriched'],
    metadata: { lead: enrichedLead, enrichmentReceipt: result.receipt },
    importance: Math.max(0.5, (enrichedLead.score || 50) / 100),
    source: 'agent',
  });
  return enrichedLead;
}
