#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { executeRegisteredTool } from '../src/tools/registry.js';

const context = { sessionId: 'outreach-draft-smoke', agent: 'elora' } as any;
const result = await executeRegisteredTool('outreach.draft_email', {
  leadId: 'lead_smoke_outreach',
  contactName: 'Avery',
  contactEmail: 'avery@example.com',
  company: 'Riverbend Home Services',
  valueProposition: 'Your missed-call and CRM follow-up gaps look like a practical place to recover booked jobs.',
  callToAction: 'Would it be useful to compare notes next week?',
}, context) as any;

assert.equal(result.ok, true);
assert.equal(result.status, 'draft');
assert.equal(result.workflow, 'outreach');
assert.equal(result.draft.contactEmail, 'avery@example.com');
assert.match(result.draft.body, /Would it be useful/);
console.log('outreach draft smoke passed');
