import assert from 'node:assert/strict';
import { decidePolicy, type PolicyBoundary, type PolicyDecisionInput } from '../src/governance/policyDecision.js';

interface AppendixBCase {
  name: string;
  input: PolicyDecisionInput;
  expectedDecision: 'act' | 'report' | 'escalate' | 'refuse';
  expectedBoundary?: PolicyBoundary;
  expectedReceiptRequired: boolean;
}

function assertAppendixBDecision(testCase: AppendixBCase) {
  const decision = decidePolicy(testCase.input);
  assert.equal(decision.decision, testCase.expectedDecision, `${testCase.name}: canonical Alpha decision`);
  assert.equal(decision.boundary, testCase.expectedBoundary, `${testCase.name}: boundary label`);
  assert.equal(decision.receiptRequired, testCase.expectedReceiptRequired, `${testCase.name}: receipt requirement`);

  if (testCase.expectedDecision === 'act' || testCase.expectedDecision === 'report') {
    assert.equal(decision.action, 'execute', `${testCase.name}: act/report executes inside the trust envelope`);
  } else if (testCase.expectedDecision === 'escalate') {
    assert.equal(decision.action, 'ask_before_execution', `${testCase.name}: escalation asks before execution`);
  } else {
    assert.equal(decision.action, 'blocked', `${testCase.name}: refusal/challenge blocks execution`);
  }
}

const appendixBMatrix: AppendixBCase[] = [
  {
    name: 'internal Alpha Scope document creation',
    input: {
      category: 'alpha',
      action: 'create_alpha_scope_document',
      riskLevel: 'write',
      approvalScope: 'repo.write',
      input: { path: 'alpha/core-alpha-scope.md', visibility: 'internal' },
    },
    expectedDecision: 'act',
    expectedReceiptRequired: true,
  },
  {
    name: 'markdown Nex work order creation',
    input: {
      category: 'delegation',
      action: 'create_markdown_nex_work_order',
      riskLevel: 'write',
      input: { assignee: 'Nex', path: 'work-orders/nex-core-alpha.md', visibility: 'internal' },
    },
    expectedDecision: 'act',
    expectedReceiptRequired: true,
  },
  {
    name: 'public sharing',
    input: {
      category: 'alpha',
      action: 'share_public_alpha_scope',
      riskLevel: 'external_send',
      input: { destination: 'public_share', artifactPath: 'alpha/core-alpha-scope.md' },
    },
    expectedDecision: 'escalate',
    expectedBoundary: 'public_representation',
    expectedReceiptRequired: true,
  },
  {
    name: 'buying a domain or SaaS tool',
    input: {
      category: 'digitalocean',
      action: 'purchase_domain_or_saas_subscription',
      riskLevel: 'purchase_or_commit',
      input: { domain: 'example-alpha.com', estimatedCost: '$20/mo', vendor: 'SaaS tool' },
    },
    expectedDecision: 'escalate',
    expectedBoundary: 'rmt',
    expectedReceiptRequired: true,
  },
  {
    name: 'importing client financial data',
    input: {
      category: 'databank',
      action: 'import_client_financial_data',
      riskLevel: 'write',
      input: { source: 'client_financial_records.csv', contains: 'client financial data' },
    },
    expectedDecision: 'escalate',
    expectedBoundary: 'personal_information_sensitive',
    expectedReceiptRequired: true,
  },
  {
    name: 'permanent deletion',
    input: {
      category: 'alpha',
      action: 'permanent_delete_alpha_artifact',
      riskLevel: 'write',
      input: { path: 'alpha/core-alpha-scope.md', permanent: true },
    },
    expectedDecision: 'escalate',
    expectedBoundary: 'destructive_irreversible',
    expectedReceiptRequired: true,
  },
  {
    name: 'internal pricing model draft',
    input: {
      category: 'alpha',
      action: 'draft_internal_pricing_model',
      riskLevel: 'write',
      input: { path: 'alpha/pricing-model.md', visibility: 'internal', content: 'draft pricing model' },
    },
    expectedDecision: 'report',
    expectedReceiptRequired: true,
  },
  {
    name: 'misrepresenting CORE as AGI',
    input: {
      category: 'marketing',
      action: 'claim_core_is_agi',
      riskLevel: 'external_send',
      input: { claim: 'Represent CORE as AGI in public marketing copy.' },
    },
    expectedDecision: 'refuse',
    expectedBoundary: 'unsupported_capability',
    expectedReceiptRequired: true,
  },
];

for (const testCase of appendixBMatrix) {
  assertAppendixBDecision(testCase);
}

const setupNeeded = decidePolicy({ category: 'drive', action: 'create_text_file', riskLevel: 'write', hasRequiredSetup: false });
assert.equal(setupNeeded.action, 'setup_needed');
assert.equal(setupNeeded.receiptRequired, true);

console.log('policy decision smoke checks passed');
