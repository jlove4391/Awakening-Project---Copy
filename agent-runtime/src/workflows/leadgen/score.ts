import type { LeadRecord, LeadgenIcp } from './types.js';

export function scoreLeads(leads: LeadRecord[], icp: LeadgenIcp): LeadRecord[] {
  return leads.map((lead) => {
    const reasons: string[] = [];
    let score = 45;

    if (icp.titles.some((title) => lead.title.toLowerCase().includes(title.toLowerCase()))) {
      score += 25;
      reasons.push('title matches ICP');
    }
    if (lead.geography && icp.geography && lead.geography.toLowerCase().includes(icp.geography.toLowerCase())) {
      score += 10;
      reasons.push('geography matches');
    }
    if (lead.signals.length) {
      score += Math.min(20, lead.signals.length * 5);
      reasons.push('buying signals present');
    }
    if (lead.email) {
      score += 5;
      reasons.push('reachable email present');
    }

    return {
      ...lead,
      score: Math.min(100, score),
      scoreReasons: reasons.length ? reasons : ['baseline ICP fit'],
      status: 'scored' as const,
      updatedAt: new Date().toISOString(),
    };
  }).sort((a, b) => (b.score || 0) - (a.score || 0));
}
