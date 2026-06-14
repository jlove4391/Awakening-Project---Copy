#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { executeRegisteredTool } from '../src/tools/registry.js';

const context = { sessionId: 'objection-report-smoke', agent: 'elora' } as any;
const callTranscript = {
  id: 'call_smoke_objections', leadId: 'lead_smoke_objections', source: 'manual', callDate: '2026-06-14T10:00:00.000Z',
  participants: ['Jordan', 'Avery'], status: 'imported', summary: 'Avery raised timing, budget, and implementation capacity concerns.',
  transcript: 'Avery: I like this, but the price feels high, timing is tight, and I am worried my team cannot implement another system. Jordan: We can scope the smallest safe first win for review.',
};
const result = await executeRegisteredTool('objection.create_call_insight_report', {
  callTranscript,
  prospectContext: { company: 'Riverbend Home Services' },
  offerProposalContext: { offer: 'Revenue follow-up stabilization' },
  reportId: 'objection_report_smoke',
}, context) as any;

assert.equal(result.externalSend, false);
assert.equal(result.internalOnly, true);
assert.equal(result.report.id, 'objection_report_smoke');
assert.ok(result.report.extractedObjections.length >= 1);
assert.ok(result.report.proposalImprovementNotes.length >= 1);
console.log('objection report smoke passed');
