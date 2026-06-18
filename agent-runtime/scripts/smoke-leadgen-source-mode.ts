import assert from 'node:assert/strict';
import { parseLeadgenSourceMode, leadgenSourceModes } from '../src/config.js';
import { sourceLeads, sourceLeadsForMode } from '../src/workflows/leadgen/source.js';
import type { LeadgenIcp } from '../src/workflows/leadgen/types.js';

const expectedModes = ['synthetic', 'sheets', 'clay_direct', 'clay_sheets', 'manual', 'web_research'] as const;
assert.deepEqual(leadgenSourceModes, expectedModes);
for (const mode of expectedModes) assert.equal(parseLeadgenSourceMode(mode), mode);
assert.throws(() => parseLeadgenSourceMode('invalid'), /Invalid LEADGEN_SOURCE_MODE/);

const icp: LeadgenIcp = {
  market: 'local home services',
  titles: ['Owner'],
  geography: 'Austin, TX',
  buyingSignals: ['missed calls'],
  limit: 2,
  summary: 'Local home services in Austin',
};

for (const mode of expectedModes) {
  const modeLeads = await sourceLeadsForMode(icp, mode);
  assert.ok(Array.isArray(modeLeads), `${mode} should return a lead array`);
}

const leads = await sourceLeads(icp);
assert.equal(leads.length, 2);
for (const lead of leads) {
  assert.ok(lead.id);
  assert.ok(lead.fullName);
  assert.ok(lead.title);
  assert.ok(lead.company);
  assert.equal(lead.market, icp.market);
  assert.equal(lead.status, 'discovered');
  assert.ok(lead.updatedAt);
  assert.ok(Array.isArray(lead.signals));
}

console.log('leadgen source mode dispatch smoke passed');
