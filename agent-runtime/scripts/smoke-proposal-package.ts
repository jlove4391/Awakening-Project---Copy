#!/usr/bin/env tsx

import assert from 'node:assert/strict';
import { executeRegisteredTool } from '../src/tools/registry.js';

const context = { sessionId: 'proposal-package-smoke', agent: 'elora' } as any;
const now = '2026-06-14T10:00:00.000Z';
const intakeRecord = {
  id: 'intake_smoke_proposal', sessionId: context.sessionId, status: 'submitted', createdAt: now, updatedAt: now, submittedAt: now,
  summary: 'CRM automation and missed-call follow-up gaps are costing booked work.',
  responses: { businessName: 'Riverbend Home Services', contactName: 'Avery Chen', mainBottleneck: 'CRM automation and follow-up gaps', desiredOutcome: 'Recover missed booked jobs' },
};
const offerTemplate = {
  id: 'offer_smoke_core', name: 'Core Revenue Follow-up Stabilization', version: 'smoke', description: 'Stabilize lead response automation and follow-up operating rhythm.',
  recommendedSolution: 'Implement a safe lead response workflow and review cadence.', implementationScope: ['Audit CRM stages', 'Draft follow-up SOP', 'Create first 30-day dashboard'],
  timeline: '30 days', priceRange: '$5k-$8k', guardrails: ['Jordan reviews final proposal before external send.'], createdAt: now, updatedAt: now,
};

const result = await executeRegisteredTool('proposal.create_package', {
  packageId: 'proposal_package_smoke', intakeRecord, offerTemplate,
  notes: ['Prospect wants a practical first win before expanding scope.'],
  domainSpecialistDraft: { specialist: 'nexora', summary: 'Automation scope should start with CRM assignment and callback routing.', implementationScope: ['Map lead intake triggers', 'Define retry and escalation rules'] },
  createdAt: now,
}, context) as any;

assert.equal(result.externalSend, false);
assert.equal(result.approvedForExternalSend, false);
assert.equal(result.reviewRequiredBy, 'Jordan');
assert.equal(result.packageId, 'proposal_package_smoke');
assert.ok(result.proposalRecord.id);
console.log('proposal package smoke passed');
