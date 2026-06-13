import { randomUUID } from 'node:crypto';
import type { ReplyClass, ReplyClassification } from './types.js';

export interface ReplyClassificationInput {
  replyText: string;
  subject?: string;
  receiptId?: string;
  threadId?: string;
  messageId?: string;
  receivedAt?: string;
  classifiedBy?: string;
  modelSuggestion?: ModelAssistedReplyClassification;
  metadata?: Record<string, unknown>;
}

export interface ModelAssistedReplyClassification {
  replyClass: ReplyClass;
  confidence?: number;
  summary?: string;
  nextAction?: string;
  requiresHumanApproval?: boolean;
  reasons?: string[];
}

export interface ReplyClassificationSignal {
  replyClass: ReplyClass;
  signal: string;
  weight: number;
  reason: string;
}

export interface OutreachReplyClassificationResult extends ReplyClassification {
  recommendedNextAction: string;
  requiresHumanApproval: boolean;
  reasons: string[];
  scores: Record<ReplyClass, number>;
  matchedSignals: ReplyClassificationSignal[];
}

type ReplySignal = {
  replyClass: ReplyClass;
  patterns: readonly RegExp[];
  weight: number;
  label: string;
};

const REPLY_CLASS_ORDER: ReplyClass[] = [
  'unsubscribe/do not contact',
  'wrong person',
  'asks for price',
  'asks for details',
  'interested',
  'needs follow-up later',
  'objection',
  'not interested',
];

const SIGNALS: ReplySignal[] = [
  {
    replyClass: 'unsubscribe/do not contact',
    patterns: [/\bunsubscribe\b/i, /\bopt\s*out\b/i, /\bremove me\b/i, /\btake me off\b/i, /\bdo not (?:email|contact|message|call)\b/i, /\bdon't (?:email|contact|message|call)\b/i, /\bstop (?:emailing|contacting|messaging|sending)\b/i, /\bno further contact\b/i],
    weight: 10,
    label: 'explicit opt-out request',
  },
  {
    replyClass: 'wrong person',
    patterns: [/\bwrong person\b/i, /\bnot (?:the )?(?:right|correct) person\b/i, /\bnot my (?:area|department|role|responsibility)\b/i, /\bi (?:am not|ain't) responsible\b/i, /\bcontact (?:someone else|our|the)\b/i, /\btry (?:someone else|our|the)\b/i, /\bplease reach out to\b/i],
    weight: 8,
    label: 'wrong-contact or referral signal',
  },
  {
    replyClass: 'asks for price',
    patterns: [/\bprice\b/i, /\bpricing\b/i, /\bcost\b/i, /\brate\b/i, /\bfee\b/i, /\bquote\b/i, /\bestimate\b/i, /\bhow much\b/i, /\bpackages?\b/i, /\bsubscription\b/i],
    weight: 7,
    label: 'pricing question',
  },
  {
    replyClass: 'asks for details',
    patterns: [/\btell me more\b/i, /\bmore (?:info|information|details)\b/i, /\bsend (?:me )?(?:info|information|details|deck|overview)\b/i, /\bhow (?:does|would|will|can) (?:this|it|that) work\b/i, /\bwhat (?:does|would|will|can) (?:this|it|that)\b/i, /\bcase stud(?:y|ies)\b/i, /\bexamples?\b/i, /\bcan you explain\b/i],
    weight: 6,
    label: 'details request',
  },
  {
    replyClass: 'interested',
    patterns: [/\binterested\b/i, /\blet'?s (?:talk|chat|connect|discuss|meet)\b/i, /\bsounds (?:good|great|interesting)\b/i, /\bbook (?:a )?(?:call|meeting|demo)\b/i, /\bschedule (?:a )?(?:call|meeting|demo)\b/i, /\bavailable (?:for|to)\b/i, /\byes[,!.\s]/i, /\bi'?d like to\b/i],
    weight: 6,
    label: 'positive buying intent',
  },
  {
    replyClass: 'needs follow-up later',
    patterns: [/\bfollow up (?:later|next|in|after)\b/i, /\bcheck back\b/i, /\breach out (?:later|next|in|after)\b/i, /\bnot (?:now|right now|at this time)\b/i, /\btoo busy\b/i, /\bnext (?:week|month|quarter|year)\b/i, /\bin (?:a few|\d+) (?:days|weeks|months)\b/i, /\bafter (?:the )?(?:holidays|quarter|launch|budget|conference)\b/i],
    weight: 6,
    label: 'deferred timing request',
  },
  {
    replyClass: 'objection',
    patterns: [/\balready (?:have|using|work with)\b/i, /\bnot a priority\b/i, /\bno budget\b/i, /\btoo expensive\b/i, /\bconcern(?:ed)?\b/i, /\bwe use\b/i, /\bcontract\b/i, /\bvendor\b/i, /\bsecurity review\b/i, /\bcompliance\b/i],
    weight: 5,
    label: 'sales objection',
  },
  {
    replyClass: 'not interested',
    patterns: [/\bnot interested\b/i, /\bno thanks\b/i, /\bno thank you\b/i, /\bpass\b/i, /\bnot a fit\b/i, /\bno need\b/i, /\bwe'?re good\b/i, /\bnot looking\b/i],
    weight: 5,
    label: 'negative intent',
  },
];

const NEXT_ACTIONS: Record<ReplyClass, string> = {
  interested: 'Draft a personalized booking response with suggested meeting times and send only after human approval.',
  'not interested': 'Mark the lead as not interested and do not send additional sales follow-up unless a human reopens the conversation.',
  'asks for price': 'Draft a pricing response or pricing-discovery question for human review before sending.',
  'asks for details': 'Draft a concise details response with relevant proof points and request human approval before sending.',
  'wrong person': 'Ask a human to verify the suggested contact or update the CRM before any new outreach.',
  'needs follow-up later': 'Schedule a follow-up reminder for the requested timeframe; require human approval before sending later outreach.',
  objection: 'Draft an objection-handling response for human review before sending.',
  'unsubscribe/do not contact': 'Record the opt-out/do-not-contact request immediately and suppress all future outreach.',
};

const HUMAN_APPROVAL: Record<ReplyClass, boolean> = {
  interested: true,
  'not interested': false,
  'asks for price': true,
  'asks for details': true,
  'wrong person': true,
  'needs follow-up later': true,
  objection: true,
  'unsubscribe/do not contact': false,
};

function createEmptyScores(): Record<ReplyClass, number> {
  return Object.fromEntries(REPLY_CLASS_ORDER.map((replyClass) => [replyClass, 0])) as Record<ReplyClass, number>;
}

function normalizeText(input: ReplyClassificationInput): string {
  return [input.subject, input.replyText].filter(Boolean).join('\n').trim();
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function confidenceFor(scores: Record<ReplyClass, number>, replyClass: ReplyClass): number {
  const total = REPLY_CLASS_ORDER.reduce((sum, candidate) => sum + scores[candidate], 0);
  if (total === 0) return 0.35;

  const ranked = [...REPLY_CLASS_ORDER].sort((left, right) => scores[right] - scores[left]);
  const runnerUp = ranked.find((candidate) => candidate !== replyClass);
  const separation = runnerUp ? Math.max(scores[replyClass] - scores[runnerUp], 0) / Math.max(scores[replyClass], 1) : 1;
  const signalStrength = Math.min(scores[replyClass] / 10, 1);
  const share = scores[replyClass] / total;

  return roundConfidence(0.45 + signalStrength * 0.25 + share * 0.2 + separation * 0.1);
}

function selectReplyClass(scores: Record<ReplyClass, number>): ReplyClass {
  return [...REPLY_CLASS_ORDER].sort((left, right) => {
    const scoreDifference = scores[right] - scores[left];
    if (scoreDifference !== 0) return scoreDifference;
    return REPLY_CLASS_ORDER.indexOf(left) - REPLY_CLASS_ORDER.indexOf(right);
  })[0];
}

function canUseModelSuggestion(modelSuggestion: ModelAssistedReplyClassification | undefined, deterministicScore: number): modelSuggestion is ModelAssistedReplyClassification {
  return Boolean(modelSuggestion && deterministicScore === 0 && (modelSuggestion.confidence ?? 0) >= 0.7);
}

export function classifyReply(input: ReplyClassificationInput): OutreachReplyClassificationResult {
  const text = normalizeText(input);
  const scores = createEmptyScores();
  const matchedSignals: ReplyClassificationSignal[] = [];

  for (const signal of SIGNALS) {
    for (const pattern of signal.patterns) {
      const match = text.match(pattern);
      if (!match) continue;

      scores[signal.replyClass] += signal.weight;
      matchedSignals.push({
        replyClass: signal.replyClass,
        signal: signal.label,
        weight: signal.weight,
        reason: `Matched ${signal.label}: "${match[0]}".`,
      });
      break;
    }
  }

  const deterministicClass = selectReplyClass(scores);
  const deterministicScore = scores[deterministicClass];
  const modelSuggestion = canUseModelSuggestion(input.modelSuggestion, deterministicScore) ? input.modelSuggestion : undefined;
  const usedModelSuggestion = Boolean(modelSuggestion);
  const replyClass = modelSuggestion ? modelSuggestion.replyClass : deterministicClass;
  const confidence = modelSuggestion ? roundConfidence(modelSuggestion.confidence ?? 0.7) : confidenceFor(scores, replyClass);
  const reasons = matchedSignals.length
    ? matchedSignals.map((match) => match.reason)
    : usedModelSuggestion
      ? modelSuggestion?.reasons ?? ['No deterministic keyword match; accepted high-confidence model-assisted classification.']
      : ['No deterministic keyword match; defaulting to not interested for conservative outreach handling.'];
  const recommendedNextAction = modelSuggestion?.nextAction ?? NEXT_ACTIONS[replyClass];
  const requiresHumanApproval = modelSuggestion?.requiresHumanApproval ?? HUMAN_APPROVAL[replyClass];
  const classifiedAt = new Date().toISOString();

  return {
    id: randomUUID(),
    receiptId: input.receiptId,
    threadId: input.threadId,
    messageId: input.messageId,
    replyClass,
    confidence,
    summary: modelSuggestion?.summary,
    nextAction: recommendedNextAction,
    classifiedAt,
    classifiedBy: input.classifiedBy ?? (usedModelSuggestion ? 'model-assisted' : 'deterministic-rules'),
    metadata: {
      ...input.metadata,
      receivedAt: input.receivedAt,
      usedModelSuggestion,
    },
    recommendedNextAction,
    requiresHumanApproval,
    reasons,
    scores,
    matchedSignals,
  };
}
