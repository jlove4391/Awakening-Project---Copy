import type { ApprovalScope } from '../tasks/types.js';
import type { RegisteredToolDefinition, ToolRiskLevel } from '../tools/registry.js';

export type PolicyBoundary = 'rmt' | 'personal_information_sensitive' | 'destructive_irreversible' | 'external_commitment' | 'public_representation' | 'unsupported_capability';
export type AlphaPolicyDecisionAction = 'act' | 'report' | 'escalate' | 'refuse' | 'setup_needed';
export type LegacyPolicyAction = 'execute' | 'ask_before_execution' | 'setup_needed' | 'blocked';
export type PolicyAction = LegacyPolicyAction;
export type AlphaRiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';
export type AlphaReversibility = 'reversible' | 'partially_reversible' | 'irreversible' | 'unknown';
export type AlphaConsequenceDomain = 'workspace' | 'internal_operations' | 'public' | 'financial' | 'client_data' | 'infrastructure' | 'legal_reputation' | 'runtime_setup';
export type AlphaMemoryBasis = 'none' | 'tool_registry' | 'user_instruction' | 'runtime_context' | 'policy_appendix_b';

export interface PolicyDecisionInput {
  toolName?: string;
  action?: string;
  category?: string;
  riskLevel?: ToolRiskLevel | 'unknown';
  approvalScope?: ApprovalScope | string;
  input?: Record<string, unknown>;
  hasRequiredSetup?: boolean;
}

export type PolicyClassification =
  | 'setup_needed'
  | 'explicit_boundary'
  | 'ordinary_execution'
  | 'execute_with_receipt'
  | 'blocked';

interface PolicyDecisionBase {
  decision: AlphaPolicyDecisionAction;
  action: LegacyPolicyAction;
  riskLevel: AlphaRiskLevel;
  reversibility: AlphaReversibility;
  consequenceDomain: AlphaConsequenceDomain;
  confidence: number;
  memoryBasis: AlphaMemoryBasis;
  reason: string;
  boundary?: PolicyBoundary;
  trustDomain: string;
  receiptRequired: boolean;
  policyClassification: PolicyClassification;
}

export interface ExecutePolicyDecision extends PolicyDecisionBase {
  decision: 'act' | 'report';
  action: 'execute';
  boundary?: undefined;
  policyClassification: 'ordinary_execution' | 'execute_with_receipt';
}

export interface AskBeforeExecutionPolicyDecision extends PolicyDecisionBase {
  decision: 'escalate';
  action: 'ask_before_execution';
  boundary: PolicyBoundary;
  policyClassification: 'explicit_boundary';
}

export interface SetupNeededPolicyDecision extends PolicyDecisionBase {
  decision: 'setup_needed';
  action: 'setup_needed';
  provider?: string;
  nextSteps: string[];
  policyClassification: 'setup_needed';
}

export interface BlockedPolicyDecision extends PolicyDecisionBase {
  decision: 'refuse';
  action: 'blocked';
  boundary?: PolicyBoundary;
  provider?: string;
  nextSteps?: string[];
  policyClassification: 'blocked';
}

export type PolicyDecision =
  | ExecutePolicyDecision
  | AskBeforeExecutionPolicyDecision
  | SetupNeededPolicyDecision
  | BlockedPolicyDecision;

const RMT_TERMS = ['purchase', 'payment', 'pay', 'bank', 'transfer', 'subscription', 'contract', 'invoice_payment', 'money', 'financial_commitment', 'domain', 'saas'];
const PERSONAL_INFORMATION_TERMS = ['personal', 'private', 'identity', 'financial_record', 'financial data', 'client financial', 'health', 'family', 'password', 'secret', 'token', 'contact', 'correspondence', 'email_send', 'send_email', 'forward', 'share', 'expose', 'import_client_financial'];
const PUBLIC_SHARING_TERMS = ['public', 'publish', 'post', 'tweet', 'linkedin', 'share_public', 'public_share'];
const PRICING_DRAFT_TERMS = ['pricing model', 'pricing_model', 'price model', 'draft pricing', 'pricing draft'];
const AGI_MISREPRESENTATION_TERMS = ['agi', 'artificial general intelligence', 'superintelligence', 'sentient', 'conscious ai'];

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
  return (input.riskLevel === 'purchase_or_commit' && input.category !== 'code') || includesAny(text, RMT_TERMS);
}

export function isPersonalInformationSensitivePolicyInput(input: PolicyDecisionInput) {
  const text = haystack(input);
  if (input.riskLevel === 'external_send' || input.approvalScope === 'external.send') return true;
  return includesAny(text, PERSONAL_INFORMATION_TERMS);
}

export function isDestructiveIrreversiblePolicyInput(input: PolicyDecisionInput) {
  const text = haystack(input);
  const permanent = input.input?.permanent === true || input.input?.irreversible === true;
  return permanent || text.includes('delete_infrastructure') || text.includes('permanent_delete') || text.includes('permanent deletion') || text.includes('destroy');
}

export function isOrdinaryWorkspacePolicyInput(input: PolicyDecisionInput) {
  const ordinaryRepoScopes = new Set(['repo.write', 'repo.command', 'repo.commit']);
  if (input.approvalScope && ordinaryRepoScopes.has(String(input.approvalScope))) return true;
  if (input.category === 'code' || input.category === 'vscode' || input.category === 'nexora') return !isDestructiveIrreversiblePolicyInput(input);
  if (input.category === 'memory') return !isPersonalInformationSensitivePolicyInput(input);
  if (input.category === 'drive') return String(input.action || '').startsWith('create') && !isPersonalInformationSensitivePolicyInput(input);
  if (input.category === 'gmail') return /draft|search|read|list|organize/u.test(String(input.action || '')) && !isPersonalInformationSensitivePolicyInput(input);
  if (input.category === 'delegation') return true;
  return input.riskLevel === 'read';
}

function baseMeta(input: PolicyDecisionInput): Pick<PolicyDecisionBase, 'riskLevel' | 'reversibility' | 'consequenceDomain' | 'confidence' | 'memoryBasis' | 'trustDomain' | 'receiptRequired'> {
  const text = haystack(input);
  const trustDomain = trustDomainForPolicyInput(input);
  const consequenceDomain: AlphaConsequenceDomain = input.category === 'digitalocean' ? 'infrastructure'
    : includesAny(text, PUBLIC_SHARING_TERMS) ? 'public'
      : isRmtPolicyInput(input) ? 'financial'
        : isPersonalInformationSensitivePolicyInput(input) ? 'client_data'
          : input.hasRequiredSetup === false ? 'runtime_setup'
            : input.category === 'delegation' ? 'internal_operations'
              : 'workspace';
  const reversibility: AlphaReversibility = isDestructiveIrreversiblePolicyInput(input) ? 'irreversible'
    : input.riskLevel === 'external_send' || includesAny(text, PUBLIC_SHARING_TERMS) || isRmtPolicyInput(input) ? 'partially_reversible'
      : 'reversible';
  const riskLevel: AlphaRiskLevel = input.riskLevel === 'read' ? 'low'
    : reversibility === 'irreversible' ? 'critical'
      : isRmtPolicyInput(input) || isPersonalInformationSensitivePolicyInput(input) || includesAny(text, PUBLIC_SHARING_TERMS) ? 'high'
        : input.riskLevel === 'unknown' || !input.riskLevel ? 'unknown'
          : 'medium';
  return { riskLevel, reversibility, consequenceDomain, confidence: 0.86, memoryBasis: 'tool_registry', trustDomain, receiptRequired: input.riskLevel !== 'read' };
}

function withMeta<T extends Omit<PolicyDecision, keyof ReturnType<typeof baseMeta>>>(input: PolicyDecisionInput, decision: T): PolicyDecision {
  return { ...baseMeta(input), ...decision } as PolicyDecision;
}

export function decidePolicy(input: PolicyDecisionInput): PolicyDecision {
  const text = haystack(input);
  if (input.hasRequiredSetup === false) {
    return withMeta(input, { decision: 'setup_needed', action: 'setup_needed', provider: input.category, reason: 'Required credentials, integration wiring, or external setup is missing.', nextSteps: ['Configure the provider credentials or local integration.', 'Retry the action after setup is confirmed.'], receiptRequired: true, policyClassification: 'setup_needed' });
  }
  if (includesAny(text, AGI_MISREPRESENTATION_TERMS) && /claim|say|market|represent|promise|unsupported|misrepresent/u.test(text)) {
    return withMeta(input, { decision: 'refuse', action: 'blocked', boundary: 'unsupported_capability', reason: 'Unsupported AGI or sentience representations are not allowed.', receiptRequired: true, policyClassification: 'blocked' });
  }
  if (includesAny(text, PUBLIC_SHARING_TERMS)) {
    return withMeta(input, { decision: 'escalate', action: 'ask_before_execution', boundary: 'public_representation', reason: 'Public sharing or publishing requires explicit approval before execution.', receiptRequired: true, policyClassification: 'explicit_boundary' });
  }
  if (isRmtPolicyInput(input)) {
    return withMeta(input, { decision: 'escalate', action: 'ask_before_execution', boundary: 'rmt', reason: 'Action may create money movement, purchase, subscription, contract, domain/SaaS purchase, or financial/legal commitment.', receiptRequired: true, policyClassification: 'explicit_boundary' });
  }
  if (isPersonalInformationSensitivePolicyInput(input)) {
    return withMeta(input, { decision: 'escalate', action: 'ask_before_execution', boundary: 'personal_information_sensitive', reason: 'Action may expose, transmit, delete, alter, share, or import client personal/private/financial information.', receiptRequired: true, policyClassification: 'explicit_boundary' });
  }
  if (isDestructiveIrreversiblePolicyInput(input)) {
    return withMeta(input, { decision: 'escalate', action: 'ask_before_execution', boundary: 'destructive_irreversible', reason: 'Permanent deletion or destructive irreversible action requires explicit approval.', receiptRequired: true, policyClassification: 'explicit_boundary' });
  }
  if (includesAny(text, PRICING_DRAFT_TERMS)) {
    return withMeta(input, { decision: 'report', action: 'execute', reason: 'Pricing model drafts may be prepared internally as report-only work; approval is needed before external commitment or sharing.', receiptRequired: true, policyClassification: 'execute_with_receipt' });
  }
  if (isOrdinaryWorkspacePolicyInput(input)) {
    const reportOnly = input.riskLevel === 'read' || /draft|report|summarize|read|list|search/u.test(String(input.action || ''));
    return withMeta(input, { decision: reportOnly ? 'report' : 'act', action: 'execute', receiptRequired: input.riskLevel !== 'read', reason: reportOnly ? 'Read, draft, or internal-report work may proceed without approval.' : 'Ordinary productive work inside the current trust envelope executes with receipts.', policyClassification: input.riskLevel === 'read' ? 'ordinary_execution' : 'execute_with_receipt' });
  }
  return withMeta(input, { decision: 'escalate', action: 'ask_before_execution', boundary: 'external_commitment', reason: 'Action is outside the ordinary workspace execution envelope.', receiptRequired: true, policyClassification: 'explicit_boundary' });
}

export function decideToolPolicy(definition: Pick<RegisteredToolDefinition, 'name' | 'riskLevel' | 'audit' | 'requiredApprovalScope'>, input: Record<string, unknown> = {}, approvalScope?: ApprovalScope | string) {
  return decidePolicy({ toolName: definition.name, action: definition.audit.action, category: definition.audit.category, riskLevel: definition.riskLevel, approvalScope: approvalScope || definition.requiredApprovalScope, input });
}

export function decidePolicyForToolName(toolName: string, input: Record<string, unknown> = {}, approvalScope?: ApprovalScope | string) {
  const [category = 'runtime', action = toolName] = toolName.split('.', 2);
  return decidePolicy({ toolName, action, category, approvalScope, input, riskLevel: 'unknown' });
}

export function policyRequiresApproval(decision: PolicyDecision) {
  return decision.decision === 'escalate';
}

export function policyBlocksExecution(decision: PolicyDecision) {
  return decision.decision === 'refuse';
}
