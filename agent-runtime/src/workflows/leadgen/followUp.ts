import type { LeadRecord } from './types.js';

export function scheduleFollowUp(leads: LeadRecord[], daysFromNow = 3) {
  const dueAt = new Date(Date.now() + Math.max(1, daysFromNow) * 24 * 60 * 60 * 1000).toISOString();
  return leads.map((lead) => ({
    ...lead,
    status: 'follow_up_due' as const,
    updatedAt: new Date().toISOString(),
    enrichment: { ...(lead.enrichment || {}), followUpDueAt: dueAt },
  }));
}
