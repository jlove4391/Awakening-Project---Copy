import { remember, retrieveMemories } from '../../memory/index.js';
import { completeExecutionRecord, createExecutionRecord, summarizeProviderResponse, writeExecutionRecord } from '../../executions.js';
import { upsertCrmContact } from '../../providers/crm/index.js';
import { attachOutreachDrafts } from './draftOutreach.js';
import { approveCampaign, campaignApprovalRequired } from './approveCampaign.js';
import type { ApprovalGateInput, LeadRecord, LeadgenStepContext, LeadgenWorkflowResult } from './types.js';

export interface ExportSequenceInput extends ApprovalGateInput {
  leadIds: string[];
  destination: string;
  writeToCrm?: boolean;
  sendExternally?: boolean;
  followUpDays?: number;
}

function memoryText(lead: LeadRecord) {
  return `Lead ${lead.fullName} (${lead.title}) at ${lead.company} for ${lead.market}; status=${lead.status}; score=${lead.score ?? 'n/a'}`;
}

async function loadLeads(context: LeadgenStepContext, leadIds: string[]) {
  const memories = await retrieveMemories({ sessionId: context.sessionId, scopes: ['leads'], limit: 100, includeGlobal: true });
  const byId = new Map<string, LeadRecord>();
  for (const memory of memories) {
    const lead = memory.metadata?.lead as LeadRecord | undefined;
    if (lead?.id) byId.set(lead.id, lead);
  }
  return leadIds.map((id) => byId.get(id)).filter(Boolean) as LeadRecord[];
}

async function writeOutreachExportReceipt(input: ExportSequenceInput, leads: LeadRecord[], context: LeadgenStepContext) {
  const result = {
    ok: true,
    status: input.sendExternally ? 'external_send_queued_noop' : 'exported_noop',
    destination: input.destination,
    leadCount: leads.length,
    sentExternally: Boolean(input.sendExternally),
  };
  const record = createExecutionRecord({
    kind: 'runtime_action',
    whoRequested: 'leadgen.workflow',
    chosenByAgent: context.agent || 'elora',
    action: 'leadgen.outreach_export',
    inputPayload: { destination: input.destination, leadIds: input.leadIds, sendExternally: Boolean(input.sendExternally) },
    riskLevel: input.sendExternally ? 'external_send' : 'write',
    approvalStatus: 'approved',
    executionResult: result,
    providerResponseSummary: summarizeProviderResponse(result),
    linkedIds: { sessionId: context.sessionId, voiceSessionId: context.voiceSessionId },
    status: 'running',
    startedAt: new Date().toISOString(),
    receiptSummary: 'leadgen.outreach_export requested',
  });
  const completed = completeExecutionRecord(record, {
    status: 'completed',
    executionResult: result,
    providerResponseSummary: summarizeProviderResponse(result),
    approvalStatus: 'approved',
    receiptSummary: `Exported ${leads.length} lead(s) to ${input.destination}`,
  });
  await writeExecutionRecord(completed);
  return { id: completed.id, summary: completed.receipt.summary, status: completed.status };
}

export async function exportSequence(input: ExportSequenceInput, context: LeadgenStepContext): Promise<LeadgenWorkflowResult | ReturnType<typeof campaignApprovalRequired>> {
  if (input.confirmedByUser !== true) return campaignApprovalRequired('leadgen.export_sequence');

  const loadedLeads = await loadLeads(context, input.leadIds);
  const missingLeadIds = input.leadIds.filter((id) => !loadedLeads.some((lead) => lead.id === id));
  const approved = approveCampaign(loadedLeads, input);
  if (!Array.isArray(approved)) return approved;

  const drafted = attachOutreachDrafts(approved);
  const receipts: Array<{ id: string; summary: string; status: string }> = [];

  if (input.writeToCrm) {
    for (const lead of drafted) {
      const [firstName = '', ...lastNameParts] = lead.fullName.split(' ');
      const crmResult = await upsertCrmContact(
        {
          email: lead.email || `${lead.id}@unknown.invalid`,
          firstName,
          lastName: lastNameParts.join(' '),
          company: lead.company,
          notes: `Leadgen export to ${input.destination}. Score ${lead.score ?? 'n/a'}.`,
          leadId: lead.id,
          confirmedByUser: true,
          approvalNote: input.approvalNote,
        },
        context,
      );
      const receipt = 'receipt' in crmResult ? crmResult.receipt : undefined;
      if (receipt) receipts.push(receipt);
      lead.crm = { providerResult: crmResult };
    }
  }

  const exportReceipt = await writeOutreachExportReceipt(input, drafted, context);
  receipts.push(exportReceipt);

  const exportedAt = new Date().toISOString();
  const exported = drafted.map((lead) => ({ ...lead, status: 'exported' as const, exportedAt, updatedAt: exportedAt }));
  const memories = await Promise.all(
    exported.map((lead) =>
      remember(context.sessionId, memoryText(lead), {
        id: lead.id,
        scope: 'leads',
        tags: ['leadgen', 'exported', input.destination],
        metadata: { lead, destination: input.destination, receipts },
        importance: Math.max(0.5, (lead.score || 50) / 100),
        source: 'agent',
      }),
    ),
  );

  return {
    ok: true,
    status: missingLeadIds.length ? 'completed_with_missing_leads' : 'completed',
    workflow: 'leadgen',
    sessionId: context.sessionId,
    leads: exported,
    memoryIds: memories.map((memory) => memory.id),
    receipts,
    message: missingLeadIds.length ? `Exported ${exported.length} lead(s); missing lead IDs: ${missingLeadIds.join(', ')}` : `Exported ${exported.length} lead(s) to ${input.destination}.`,
  };
}
