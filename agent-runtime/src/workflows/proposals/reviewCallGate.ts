import type { ProposalRecord, ProposalReviewCall } from './types.js';

export type ProposalReviewCallGateStatus = 'allowed' | 'blocked';
export type ProposalReviewCallScheduleStatus = 'not_requested' | 'approval_required' | 'ready_for_google_calendar';

export interface ProposalReviewCallGateInput {
  proposal: ProposalRecord;
  createdAt?: string | Date;
  callId?: string;
  clientMessage?: string;
  mainClose?: string;
  externalFullProposalEmail?: boolean;
  scheduleRequest?: {
    requested: boolean;
    scheduledFor?: string;
    calendarId?: string;
    durationMinutes?: number;
    attendees?: string[];
    jordanApproved?: boolean;
    approvedBy?: string;
    approvalNote?: string;
  };
  notes?: string;
}

export interface ProposalReviewCallGateResult {
  status: ProposalReviewCallGateStatus;
  allowed: boolean;
  reasonCode:
    | 'review_call_created'
    | 'external_full_proposal_email_blocked'
    | 'main_close_full_proposal_blocked';
  reason: string;
  approvedClientMessage: string;
  blockedActions: string[];
  reviewCall: ProposalReviewCall;
  schedule: {
    status: ProposalReviewCallScheduleStatus;
    reason: string;
    requiresApprovalBy: 'Jordan';
    googleCalendarRequest?: {
      calendarId: string;
      summary: string;
      description: string;
      start: string;
      end: string;
      attendees: string[];
      confirmedByUser: true;
      approvalNote: string;
    };
  };
}

const APPROVED_WALKTHROUGH_MESSAGE = 'I prepared the proposal and would like to walk you through it.';
const FULL_PROPOSAL_TERMS = ['full proposal', 'complete proposal', 'entire proposal', 'attached proposal', 'proposal attached'];
const EMAIL_TERMS = ['email', 'send', 'sent', 'gmail', 'inbox'];

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function addMinutes(isoTime: string, minutes: number) {
  return new Date(new Date(isoTime).getTime() + minutes * 60_000).toISOString();
}

function isFullProposalEmailClose(input: ProposalReviewCallGateInput) {
  if (input.externalFullProposalEmail) {
    return true;
  }

  const closeText = [input.mainClose, input.clientMessage].map(text).join(' ').toLowerCase();
  const mentionsFullProposal = FULL_PROPOSAL_TERMS.some((term) => closeText.includes(term));
  const mentionsEmail = EMAIL_TERMS.some((term) => closeText.includes(term));

  return mentionsFullProposal && mentionsEmail;
}

function buildReviewCall(input: ProposalReviewCallGateInput, createdAt: string, blockedActions: string[]): ProposalReviewCall {
  return {
    id: input.callId || `proposal_review_call_${input.proposal.id}`,
    proposalId: input.proposal.id,
    createdAt,
    updatedAt: createdAt,
    status: input.scheduleRequest?.requested ? 'pending_jordan_calendar_approval' : 'created_pending_jordan_review',
    scheduledFor: input.scheduleRequest?.jordanApproved ? text(input.scheduleRequest.scheduledFor) : '',
    agenda: input.proposal.reviewCallAgenda?.length
      ? input.proposal.reviewCallAgenda
      : [
          'Walk through the prepared proposal at a high level.',
          'Confirm prospect priorities, scope, timeline, and next-step fit.',
          'Resolve open questions before any full proposal is sent externally.',
        ],
    unresolvedQuestions: input.proposal.unresolvedQuestions ?? [],
    notes: text(input.notes) || 'Full proposal email is blocked as the main close; use the approved walkthrough message instead.',
    metadata: {
      approvedClientMessage: APPROVED_WALKTHROUGH_MESSAGE,
      externalFullProposalEmailBlocked: blockedActions.includes('external_full_proposal_email'),
      requiresJordanApprovalBeforeGoogleCalendar: true,
      googleCalendarSchedulingRequested: Boolean(input.scheduleRequest?.requested),
    },
  };
}

function buildSchedule(input: ProposalReviewCallGateInput, reviewCall: ProposalReviewCall): ProposalReviewCallGateResult['schedule'] {
  const request = input.scheduleRequest;
  if (!request?.requested) {
    return {
      status: 'not_requested',
      reason: 'ProposalReviewCall record created; Google Calendar scheduling was not requested.',
      requiresApprovalBy: 'Jordan',
    };
  }

  if (!request.jordanApproved || text(request.approvedBy).toLowerCase() !== 'jordan') {
    return {
      status: 'approval_required',
      reason: 'Google Calendar scheduling is blocked until Jordan explicitly approves the proposal review call time.',
      requiresApprovalBy: 'Jordan',
    };
  }

  const start = text(request.scheduledFor);
  if (!start) {
    return {
      status: 'approval_required',
      reason: 'Google Calendar scheduling is blocked until an approved proposal review call time is provided.',
      requiresApprovalBy: 'Jordan',
    };
  }

  const durationMinutes = request.durationMinutes && request.durationMinutes > 0 ? request.durationMinutes : 30;

  return {
    status: 'ready_for_google_calendar',
    reason: 'Jordan approval is recorded; pass googleCalendarRequest to calendar.create_event to schedule through Google Calendar.',
    requiresApprovalBy: 'Jordan',
    googleCalendarRequest: {
      calendarId: text(request.calendarId) || 'primary',
      summary: `Proposal review call: ${text(input.proposal.title) || input.proposal.id}`,
      description: reviewCall.agenda.join('\n'),
      start,
      end: addMinutes(start, durationMinutes),
      attendees: request.attendees ?? [],
      confirmedByUser: true,
      approvalNote: text(request.approvalNote) || 'Jordan approved scheduling this proposal review call through Google Calendar.',
    },
  };
}

export function createProposalReviewCallGate(input: ProposalReviewCallGateInput): ProposalReviewCallGateResult {
  const createdAt = timestamp(input.createdAt);
  const blockedActions = isFullProposalEmailClose(input) ? ['external_full_proposal_email'] : [];
  const reviewCall = buildReviewCall(input, createdAt, blockedActions);
  const schedule = buildSchedule(input, reviewCall);
  const blocked = blockedActions.length > 0;

  return {
    status: blocked ? 'blocked' : 'allowed',
    allowed: !blocked,
    reasonCode: blocked
      ? input.externalFullProposalEmail
        ? 'external_full_proposal_email_blocked'
        : 'main_close_full_proposal_blocked'
      : 'review_call_created',
    reason: blocked
      ? 'External full-proposal email is blocked as the main close. Use the approved walkthrough message and route the prospect to a proposal review call instead.'
      : 'Proposal review call record created with approved walkthrough messaging.',
    approvedClientMessage: APPROVED_WALKTHROUGH_MESSAGE,
    blockedActions,
    reviewCall,
    schedule,
  };
}
