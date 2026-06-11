import { remember } from '../../memory/index.js';
import { defineIcp } from './defineIcp.js';
import { sourceLeads } from './source.js';
import { scoreLeads } from './score.js';
import type { LeadgenIcpInput, LeadgenStepContext, LeadgenWorkflowResult, LeadRecord } from './types.js';
export { enrichLead } from './enrich.js';
export { draftOutreach, attachOutreachDrafts } from './draftOutreach.js';
export { approveCampaign } from './approveCampaign.js';
export { exportSequence, type ExportSequenceInput } from './exportSequence.js';
export { scheduleFollowUp } from './followUp.js';

function memoryText(lead: LeadRecord) {
  return `Lead ${lead.fullName} (${lead.title}) at ${lead.company} for ${lead.market}; status=${lead.status}; score=${lead.score ?? 'n/a'}; signals=${lead.signals.join(', ')}`;
}

export async function findLeadsWorkflow(input: LeadgenIcpInput, context: LeadgenStepContext): Promise<LeadgenWorkflowResult> {
  const icp = defineIcp(input);
  const discovered = await sourceLeads(icp);
  const scored = scoreLeads(discovered, icp);
  const memories = await Promise.all(
    scored.map((lead) =>
      remember(context.sessionId, memoryText(lead), {
        id: lead.id,
        scope: 'leads',
        tags: ['leadgen', 'discovered', 'scored', icp.market],
        metadata: { lead, icp },
        importance: Math.max(0.4, (lead.score || 50) / 100),
        source: 'agent',
      }),
    ),
  );

  return {
    ok: true,
    status: 'completed',
    workflow: 'leadgen',
    sessionId: context.sessionId,
    leads: scored,
    memoryIds: memories.map((memory) => memory.id),
    message: `Discovered and scored ${scored.length} lead(s) for ${icp.summary}.`,
  };
}
