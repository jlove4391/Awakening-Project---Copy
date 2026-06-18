import assert from 'node:assert/strict';
import {
  canTransitionLeadWorkflow,
  getNextHumanDecision,
  getValidLeadWorkflowTransitions,
  leadLifecycleStates,
  leadWorkflowTransitions,
  transitionLeadWorkflow,
} from '../src/workflows/leadgen/leadWorkflowOrchestrator.js';

assert.equal(leadLifecycleStates.length, 17);
for (const state of leadLifecycleStates) assert.ok(state in leadWorkflowTransitions, `missing transition table entry for ${state}`);

assert.deepEqual(getValidLeadWorkflowTransitions('archived'), []);
assert.equal(canTransitionLeadWorkflow('scored', 'needs_human_review'), true);
assert.equal(canTransitionLeadWorkflow('lead_created', 'sent'), false);
assert.throws(() => transitionLeadWorkflow({ leadId: 'lead_1', from: 'lead_created', to: 'sent' }), /Invalid lead workflow transition/);

const first = transitionLeadWorkflow({ leadId: 'lead_1', from: 'lead_created', to: 'icp_defined', actor: 'test', at: '2026-06-18T00:00:00.000Z' });
assert.equal(first.state, 'icp_defined');
assert.equal(first.receipts.length, 1);
assert.equal(first.receipt.from, 'lead_created');
assert.equal(first.receipt.to, 'icp_defined');
assert.equal(first.receipt.actor, 'test');

const second = transitionLeadWorkflow({ leadId: 'lead_1', from: first.state, to: 'sourced', receipts: first.receipts, at: '2026-06-18T00:01:00.000Z' });
assert.equal(second.receipts.length, 2);
assert.notEqual(second.receipts[0].id, second.receipts[1].id);

const review = transitionLeadWorkflow({ leadId: 'lead_1', from: 'scored', to: 'needs_human_review' });
assert.equal(review.nextHumanDecision, 'approve_lead_for_outreach');
assert.equal(getNextHumanDecision('outreach_drafted'), 'approve_outreach_send');
assert.equal(getNextHumanDecision('sent'), undefined);

console.log('leadWorkflowOrchestrator smoke checks passed');
