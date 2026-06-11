import type { LeadgenIcp, LeadgenIcpInput } from './types.js';

function cleanList(values: string[] | undefined) {
  return [...new Set((values || []).map((value) => value.trim()).filter(Boolean))];
}

export function defineIcp(input: LeadgenIcpInput): LeadgenIcp {
  const titles = cleanList(input.titles);
  const buyingSignals = cleanList(input.buyingSignals);
  const geography = (input.geography || 'any geography').trim();
  const limit = Math.max(1, Math.min(input.limit || 25, 100));
  const market = input.market.trim();

  return {
    market,
    titles,
    geography,
    buyingSignals,
    limit,
    summary: [
      market,
      titles.length ? `titles: ${titles.join(', ')}` : 'all relevant decision makers',
      `geography: ${geography}`,
      buyingSignals.length ? `signals: ${buyingSignals.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  };
}
