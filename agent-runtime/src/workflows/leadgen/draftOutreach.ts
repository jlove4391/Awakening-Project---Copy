import type { LeadRecord, OutreachDraft } from './types.js';

export function draftOutreach(lead: LeadRecord): OutreachDraft {
  const signal = lead.signals[0] || 'your current growth priorities';
  return {
    subject: `${lead.company} + ${lead.market}`,
    body: `Hi ${lead.fullName.split(' ')[0]},\n\nI noticed ${signal} at ${lead.company}. Would it be useful to compare notes on improving ${lead.market} outcomes for teams like yours?\n\nBest,\nElora`,
    callToAction: 'Ask whether a short discovery conversation would be useful.',
  };
}

export function attachOutreachDrafts(leads: LeadRecord[]) {
  return leads.map((lead) => ({ ...lead, outreachDraft: draftOutreach(lead), updatedAt: new Date().toISOString() }));
}
