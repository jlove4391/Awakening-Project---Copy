import type { ApprovalScope } from '../tasks/types.js';
import type { RegisteredToolDefinition, ToolRiskLevel } from '../tools/registry.js';

export type PolicyBoundary = 'rmt' | 'personal_information_sensitive' | 'destructive_irreversible' | 'external_commitment';
export type PolicyAction = 'execute' | 'ask_before_execution' | 'setup_needed' | 'blocked';

export interface PolicyDecisionInput {
  toolName?: string;
  action?: string;
  category?: string;
  riskLevel?: ToolRiskLevel | 'unknown';
  approvalScope?: ApprovalScope | string;
  input?: Record<string, unknown>;
  hasRequiredSetup?: boolean;
}

export type PolicyDecision =
  | { action: 'execute'; receiptRequired: boolean; reason: string; trustDomain: string; policyClassification: 'ordinary_execution' | 'execute_with_receipt' }
  | { action: 'ask_before_execution'; boundary: PolicyBoundary; reason: string; trustDomain: string; receiptRequired: true; policyClassification: 'explicit_boundary' }
  | { action: 'setup_needed'; provider?: string; reason: string; nextSteps: string[]; trustDomain: string; receiptRequired: true; policyClassification: 'setup_needed' }
  | { action: 'blocked'; reason: string; trustDomain: string; receiptRequired: true; policyClassification: 'policy_block' };

const RMT_TERMS = [
  'purchase',
  'payment',
  'pay',
  'bank',
  'transfer',
  'subscription',
  'contract',
  'invoice_payment',
  'money',
  'financial_commitment',
];

const PERSONAL_INFORMATION_TERMS = [
  'personal',
  'private',
  'identity',
  'financial_record',
  'health',
  'family',
  'password',
  'secret',
  'token',
  'contact',
  'correspondence',
  'email_send',
  'send_email',
  'forward',
  'share',
  'expose',
];

function haystack(input: PolicyDecisionInput) {
  return [input.toolName, input.action, input.category, input.riskLevel, input.approvalScope, JSON.stringify(input.input || {})]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function trustDomainForPolicyInput(input: PolicyDecisionInput) {
  if (input.approvalScope?.startsWith('repo.')) return input.approvalScope === 'repo.command' ? 'commands' : 'repository';
  if (input.category === 'code' || input.category === 'vscode' || input.category === 'nexora') return input.riskLevel === 'code_execution' ? 'commands' : 'repository';
  if (input.category === 'drive') return 'drive';
  if (input.category === 'calendar') return 'calendar';
  if (input.category === 'gmail' || input.approvalScope === 'external.send') return 'gmail';
  if (input.category === 'memory') return 'memory';
  if (input.category === 'delegation') return 'work_orders';
  if (input.category === 'databank') return 'databanks';
  if (input.category === 'digitalocean') return 'infrastructure';
  return input.category || 'runtime';
}

export function isRmtPolicyInput(input: PolicyDecisionInput) {
  const text = haystack(input);
  return input.riskLevel === 'purchase_or_commit' && input.category !== 'code' || includesAny(text, RMT_TERMS);
}

export function isPersonalInformationSensitivePolicyInput(input: PolicyDecisionInput) {
  const text = haystack(input);
  if (input.riskLevel === 'external_send' || input.approvalScope === 'external.send') return true;
  return includesAny(text, PERSONAL_INFORMATION_TERMS);
}

export function isDestructiveIrreversiblePolicyInput(input: PolicyDecisionInput) {
  const text = haystack(input);
  const permanent = input.input?.permanent === true || input.input?.irreversible === true;
  return permanent || text.includes('delete_infrastructure') || text.includes('permanent_delete') || text.includes('destroy');
}

export function isOrdinaryWorkspacePolicyInput(input: PolicyDecisionInput) {
  const ordinaryRepoScopes = new Set(['repo.write', 'repo.command', 'repo.commit']);
  if (input.approvalScope && ordinaryRepoScopes.has(String(input.approvalScope))) return true;
  if (input.category === 'code' || input.category === 'vscode' || input.category === 'nexora') {
    return !isDestructiveIrreversiblePolicyInput(input);
  }
  if (input.category === 'memory') return !isPersonalInformationSensitivePolicyInput(input);
  if (input.category === 'drive') return String(input.action || '').startsWith('create') && !isPersonalInformationSensitivePolicyInput(input);

  if (input.category === 'gmail') return /draft|search|read|list|organize/u.test(String(input.action || '')) && !isPersonalInformationSensitivePolicyInput(input);
  if (input.category === 'delegation') return true;
  return input.riskLevel === 'read';
}

export function decidePolicy(input: PolicyDecisionInput): PolicyDecision {
  const trustDomain = trustDomainForPolicyInput(input);
  if (input.hasRequiredSetup === false) {
    return {
      action: 'setup_needed',
      provider: input.category,
      reason: 'Required credentials, integration wiring, or external setup is missing.',
      nextSteps: ['Configure the provider credentials or local integration.', 'Retry the action after setup is confirmed.'],
      trustDomain,
      receiptRequired: true,
      policyClassification: 'setup_needed',
    };
  }
  if (isRmtPolicyInput(input)) {
    return { action: 'ask_before_execution', boundary: 'rmt', reason: 'Action may create money movement, purchase, subscription, contract, or financial/legal commitment.', trustDomain, receiptRequired: true, policyClassification: 'explicit_boundary' };
  }
  if (isPersonalInformationSensitivePolicyInput(input)) {
    return { action: 'ask_before_execution', boundary: 'personal_information_sensitive', reason: 'Action may expose, transmit, delete, alter, or share personal/private information.', trustDomain, receiptRequired: true, policyClassification: 'explicit_boundary' };
  }
  if (isDestructiveIrreversiblePolicyInput(input)) {
    return { action: 'ask_before_execution', boundary: 'destructive_irreversible', reason: 'Action appears destructive or irreversible.', trustDomain, receiptRequired: true, policyClassification: 'explicit_boundary' };
  }
  if (isOrdinaryWorkspacePolicyInput(input)) {
    return { action: 'execute', receiptRequired: input.riskLevel !== 'read', reason: 'Ordinary productive work inside the current trust envelope executes with receipts.', trustDomain, policyClassification: input.riskLevel === 'read' ? 'ordinary_execution' : 'execute_with_receipt' };
  }
  return { action: 'ask_before_execution', boundary: 'external_commitment', reason: 'Action is outside the ordinary workspace execution envelope.', trustDomain, receiptRequired: true, policyClassification: 'explicit_boundary' };
}




export function decideToolPolicy(definition: Pick<RegisteredToolDefinition, 'name' | 'riskLevel' | 'audit' | 'requiredApprovalScope'>, input: Record<string, unknown> = {}, approvalScope?: ApprovalScope | string) {
  return decidePolicy({
    toolName: definition.name,
    action: definition.audit.action,
    category: definition.audit.category,
    riskLevel: definition.riskLevel,
    approvalScope: approvalScope || definition.requiredApprovalScope,
    input,
  });
}

export function policyRequiresApproval(decision: PolicyDecision) {
  return decision.action === 'ask_before_execution' || decision.action === 'blocked';
}
