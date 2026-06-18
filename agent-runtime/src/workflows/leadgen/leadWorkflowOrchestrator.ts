export const leadLifecycleStates = [
  'lead_created',
  'icp_defined',
  'sourced',
  'enriched',
  'scored',
  'needs_human_review',
  'approved_for_outreach',
  'outreach_drafted',
  'approved_to_send',
  'sent',
  'follow_up_due',
  'responded',
  'qualified',
  'disqualified',
  'converted',
  'lost',
  'archived',
] as const;

export type LeadLifecycleState = (typeof leadLifecycleStates)[number];

export type LeadWorkflowDecision =
  | 'define_icp'
  | 'approve_lead_for_outreach'
  | 'reject_or_archive_lead'
  | 'approve_outreach_send'
  | 'revise_outreach_draft'
  | 'classify_reply'
  | 'qualify_lead'
  | 'disqualify_lead'
  | 'mark_converted'
  | 'mark_lost'
  | 'archive_lead';

export interface LeadWorkflowReceipt {
  id: string;
  leadId: string;
  from: LeadLifecycleState;
  to: LeadLifecycleState;
  transition: string;
  summary: string;
  issuedAt: string;
  actor: string;
  metadata: Record<string, unknown>;
}

export interface LeadWorkflowTransitionInput {
  leadId: string;
  from: LeadLifecycleState;
  to: LeadLifecycleState;
  actor?: string;
  at?: string;
  metadata?: Record<string, unknown>;
  receipts?: LeadWorkflowReceipt[];
}

export interface LeadWorkflowTransitionResult {
  state: LeadLifecycleState;
  receipt: LeadWorkflowReceipt;
  receipts: LeadWorkflowReceipt[];
  nextHumanDecision?: LeadWorkflowDecision;
}

export const leadWorkflowTransitions: Readonly<Record<LeadLifecycleState, readonly LeadLifecycleState[]>> = {
  lead_created: ['icp_defined', 'archived'],
  icp_defined: ['sourced', 'archived'],
  sourced: ['enriched', 'needs_human_review', 'archived'],
  enriched: ['scored', 'needs_human_review', 'archived'],
  scored: ['needs_human_review', 'approved_for_outreach', 'disqualified', 'archived'],
  needs_human_review: ['approved_for_outreach', 'disqualified', 'archived'],
  approved_for_outreach: ['outreach_drafted', 'archived'],
  outreach_drafted: ['approved_to_send', 'approved_for_outreach', 'archived'],
  approved_to_send: ['sent', 'archived'],
  sent: ['follow_up_due', 'responded', 'lost', 'archived'],
  follow_up_due: ['sent', 'responded', 'lost', 'archived'],
  responded: ['qualified', 'disqualified', 'lost', 'archived'],
  qualified: ['converted', 'lost', 'archived'],
  disqualified: ['archived'],
  converted: ['archived'],
  lost: ['archived'],
  archived: [],
} as const;

export const nextHumanDecisionByLeadState: Readonly<Partial<Record<LeadLifecycleState, LeadWorkflowDecision>>> = {
  lead_created: 'define_icp',
  scored: 'approve_lead_for_outreach',
  needs_human_review: 'approve_lead_for_outreach',
  outreach_drafted: 'approve_outreach_send',
  responded: 'classify_reply',
  qualified: 'mark_converted',
};

export function isLeadLifecycleState(value: string): value is LeadLifecycleState {
  return (leadLifecycleStates as readonly string[]).includes(value);
}

export function getValidLeadWorkflowTransitions(state: LeadLifecycleState) {
  return leadWorkflowTransitions[state];
}

export function getNextHumanDecision(state: LeadLifecycleState) {
  return nextHumanDecisionByLeadState[state];
}

export function canTransitionLeadWorkflow(from: LeadLifecycleState, to: LeadLifecycleState) {
  return leadWorkflowTransitions[from].includes(to);
}

export function transitionLeadWorkflow(input: LeadWorkflowTransitionInput): LeadWorkflowTransitionResult {
  if (!canTransitionLeadWorkflow(input.from, input.to)) {
    throw new Error(`Invalid lead workflow transition: ${input.from} -> ${input.to}`);
  }

  const issuedAt = input.at || new Date().toISOString();
  const transition = `${input.from}->${input.to}`;
  const receipt: LeadWorkflowReceipt = {
    id: `leadwf_${input.leadId}_${input.from}_${input.to}_${Date.parse(issuedAt) || issuedAt}`.replace(/[^a-zA-Z0-9_-]/g, '-'),
    leadId: input.leadId,
    from: input.from,
    to: input.to,
    transition,
    summary: `Lead ${input.leadId} transitioned from ${input.from} to ${input.to}.`,
    issuedAt,
    actor: input.actor || 'leadWorkflowOrchestrator',
    metadata: input.metadata || {},
  };

  const receipts = [...(input.receipts || []), receipt];
  return { state: input.to, receipt, receipts, nextHumanDecision: getNextHumanDecision(input.to) };
}
