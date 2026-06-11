import { createHash } from 'node:crypto';
import type { LeadRecord, LeadgenIcp } from './types.js';

const firstNames = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Avery', 'Quinn'];
const lastNames = ['Reed', 'Patel', 'Chen', 'Morgan', 'Rivera', 'Brooks', 'Singh', 'Carter'];
const companySuffixes = ['Labs', 'Systems', 'Works', 'Group', 'AI', 'Cloud', 'Ops', 'Data'];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'lead';
}

function stableId(parts: string[]) {
  return `lead_${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16)}`;
}

export async function sourceLeads(icp: LeadgenIcp): Promise<LeadRecord[]> {
  const titles = icp.titles.length ? icp.titles : ['Founder', 'Head of Growth', 'VP Operations', 'Revenue Leader'];
  const signals = icp.buyingSignals.length ? icp.buyingSignals : ['matches ICP'];

  return Array.from({ length: icp.limit }, (_, index) => {
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[(index + icp.market.length) % lastNames.length];
    const company = `${icp.market.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')} ${companySuffixes[index % companySuffixes.length]}`.trim();
    const title = titles[index % titles.length];
    const id = stableId([icp.market, title, company, firstName, lastName, String(index)]);
    const domain = `${slug(company)}.example`;

    return {
      id,
      fullName: `${firstName} ${lastName}`,
      title,
      company,
      email: `${slug(firstName)}.${slug(lastName)}@${domain}`,
      linkedinUrl: `https://www.linkedin.com/in/${slug(firstName)}-${slug(lastName)}-${id.slice(-6)}`,
      geography: icp.geography,
      market: icp.market,
      signals,
      source: 'leadgen.workflow.synthetic_source',
      status: 'discovered',
      updatedAt: new Date().toISOString(),
    } satisfies LeadRecord;
  });
}
