import type {
  CallTranscriptRecord,
  IntakeRecord,
  LeadRecord,
} from "@awakening/shared";
import type {
  OfferTemplateRecord,
  ProposalRecord,
} from "../proposals/types.js";
import type { ObjectionCategory } from "./types.js";

export type ProspectContext =
  | Partial<LeadRecord | IntakeRecord>
  | Record<string, unknown>;
export type OfferProposalContext =
  | Partial<OfferTemplateRecord | ProposalRecord>
  | Record<string, unknown>;

export interface TranscriptInsight {
  summary: string;
  evidence: string;
  recommendation: string;
  confidence: "low" | "medium" | "high";
}

export interface ExtractedObjection extends TranscriptInsight {
  category: ObjectionCategory;
  responseAngle: string;
}

export interface CallInsightReport {
  id: string;
  createdAt: string;
  callTranscriptId: string;
  leadId?: string;
  clientId?: string;
  proposalId?: string;
  extractedObjections: ExtractedObjection[];
  missedBuyingSignals: TranscriptInsight[];
  missedPainPoints: TranscriptInsight[];
  betterFollowUpQuestions: string[];
  reframeSuggestions: TranscriptInsight[];
  proposalImprovementNotes: TranscriptInsight[];
  offerClarityGaps: TranscriptInsight[];
  deliveryRiskFlags: TranscriptInsight[];
  nextCallPrepNotes: string[];
  sourceSnapshot: {
    transcriptSummary?: string;
    prospectContext: string[];
    offerProposalContext: string[];
  };
}

export interface CreateCallInsightReportInput {
  callTranscript: CallTranscriptRecord;
  prospectContext?: ProspectContext;
  offerProposalContext?: OfferProposalContext;
  createdAt?: string | Date;
  reportId?: string;
}

const OBJECTION_PATTERNS: Array<{
  category: ObjectionCategory;
  keywords: string[];
  responseAngle: string;
}> = [
  {
    category: "price",
    keywords: ["too expensive", "cost", "price", "budget", "afford", "cheaper"],
    responseAngle:
      "Tie investment to quantified cost of inaction, expected capacity lift, and the smallest safe first step.",
  },
  {
    category: "timing",
    keywords: [
      "not now",
      "later",
      "next quarter",
      "busy",
      "bad time",
      "timing",
    ],
    responseAngle:
      "Reframe around what delay costs and propose a low-lift implementation window.",
  },
  {
    category: "trust",
    keywords: [
      "trust",
      "proof",
      "case study",
      "reference",
      "guarantee",
      "results",
    ],
    responseAngle:
      "Use proof, relevant examples, and a clear review checkpoint instead of overpromising.",
  },
  {
    category: "complexity",
    keywords: [
      "complicated",
      "complex",
      "overwhelming",
      "hard to use",
      "confusing",
    ],
    responseAngle:
      "Simplify the path into phases and show exactly what the prospect team must do.",
  },
  {
    category: "already have a tool",
    keywords: [
      "already have",
      "using",
      "current tool",
      "crm",
      "software",
      "platform",
    ],
    responseAngle:
      "Position the offer as improving adoption, workflows, and outcomes around existing tools where possible.",
  },
  {
    category: "need to talk to partner/team",
    keywords: ["partner", "team", "boss", "owner", "decision maker", "talk to"],
    responseAngle:
      "Equip the buyer with a concise internal business case and invite all decision makers to the next call.",
  },
  {
    category: "unclear ROI",
    keywords: ["roi", "return", "worth it", "pay for itself", "value"],
    responseAngle:
      "Quantify missed opportunities, response delays, close-rate drag, or labor savings before discussing scope.",
  },
  {
    category: "fear of AI",
    keywords: ["ai", "robot", "automated", "impersonal", "replace"],
    responseAngle:
      "Frame AI as assistant infrastructure with human control, not a replacement for relationship-based selling.",
  },
  {
    category: "privacy/compliance",
    keywords: [
      "privacy",
      "compliance",
      "secure",
      "data",
      "legal",
      "permission",
    ],
    responseAngle:
      "Clarify data handling, permissions, access boundaries, and any required compliance review.",
  },
  {
    category: "implementation burden",
    keywords: [
      "setup",
      "implement",
      "training",
      "time to build",
      "capacity",
      "bandwidth",
    ],
    responseAngle:
      "Make responsibilities, access needs, and first-week lift explicit.",
  },
  {
    category: "bad past vendor experience",
    keywords: [
      "bad experience",
      "last vendor",
      "burned",
      "didn't deliver",
      "failed before",
    ],
    responseAngle:
      "Acknowledge the prior miss and propose tighter milestones, visibility, and approval gates.",
  },
];

const BUYING_SIGNAL_KEYWORDS = [
  "need",
  "want",
  "looking for",
  "interested",
  "how soon",
  "timeline",
  "start",
  "solve",
  "help us",
  "what would it take",
];
const PAIN_KEYWORDS = [
  "missed",
  "slow",
  "fall through",
  "bottleneck",
  "manual",
  "overwhelmed",
  "waste",
  "lost",
  "leak",
  "frustrated",
  "inconsistent",
];
const RISK_KEYWORDS = [
  "access",
  "integration",
  "api",
  "migration",
  "training",
  "compliance",
  "approval",
  "data",
  "deadline",
  "custom",
];

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim())
    return new Date(value).toISOString();
  return new Date().toISOString();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function compactContext(context: unknown): string[] {
  if (!context || typeof context !== "object") return [];

  return Object.entries(context as Record<string, unknown>)
    .flatMap(([key, value]) => {
      if (value == null) return [];
      if (Array.isArray(value))
        return value
          .map((item) => `${key}: ${String(item).trim()}`)
          .filter((item) => !item.endsWith(":"));
      if (typeof value === "object") return [];
      const normalized = String(value).trim();
      return normalized ? [`${key}: ${normalized}`] : [];
    })
    .slice(0, 20);
}

function sentences(transcript: string) {
  return transcript
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter((line) => line.length > 0);
}

function includesAny(value: string, keywords: string[]) {
  const lower = value.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function confidenceFor(
  evidence: string,
  keywordCount: number,
): "low" | "medium" | "high" {
  if (keywordCount > 1 || evidence.length > 140) return "high";
  return evidence.length > 70 ? "medium" : "low";
}

function uniqueBySummary<T extends { summary: string; evidence?: string }>(
  items: T[],
) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.summary}::${item.evidence ?? ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildInsight(
  evidence: string,
  summary: string,
  recommendation: string,
  keywords: string[],
): TranscriptInsight {
  const matches = keywords.filter((keyword) =>
    evidence.toLowerCase().includes(keyword),
  );
  return {
    summary,
    evidence,
    recommendation,
    confidence: confidenceFor(evidence, matches.length),
  };
}

export function createCallInsightReport(
  input: CreateCallInsightReportInput,
): CallInsightReport {
  const transcript =
    text(input.callTranscript.transcript) || text(input.callTranscript.summary);
  const lines = sentences(transcript);
  const createdAt = timestamp(input.createdAt);
  const prospectSnapshot = compactContext(input.prospectContext);
  const offerSnapshot = compactContext(input.offerProposalContext);

  const extractedObjections = uniqueBySummary(
    OBJECTION_PATTERNS.flatMap((pattern) =>
      lines
        .filter((line) => includesAny(line, pattern.keywords))
        .map((line) => ({
          ...buildInsight(
            line,
            `${pattern.category} concern`,
            `Follow up on the concern directly. ${pattern.responseAngle}`,
            pattern.keywords,
          ),
          category: pattern.category,
          responseAngle: pattern.responseAngle,
        })),
    ),
  ).slice(0, 12);

  const missedBuyingSignals = uniqueBySummary(
    lines
      .filter((line) => includesAny(line, BUYING_SIGNAL_KEYWORDS))
      .filter((line) => !includesAny(line, ["no ", "don't", "not interested"]))
      .map((line) =>
        buildInsight(
          line,
          "Possible buying signal not fully advanced",
          "Convert this into a concrete next step, decision criterion, or implementation date.",
          BUYING_SIGNAL_KEYWORDS,
        ),
      ),
  ).slice(0, 10);

  const missedPainPoints = uniqueBySummary(
    lines
      .map((line) => line)
      .filter((line) => includesAny(line, PAIN_KEYWORDS))
      .map((line) =>
        buildInsight(
          line,
          "Pain point to quantify or restate",
          "Ask for frequency, cost, owner, impact, and what happens if this continues for 30-90 days.",
          PAIN_KEYWORDS,
        ),
      ),
  ).slice(0, 10);

  const deliveryRiskFlags = uniqueBySummary(
    lines
      .filter((line) => includesAny(line, RISK_KEYWORDS))
      .map((line) =>
        buildInsight(
          line,
          "Delivery dependency or risk needs confirmation",
          "Clarify owner, required access, deadline, acceptance criteria, and fallback plan before promising delivery.",
          RISK_KEYWORDS,
        ),
      ),
  ).slice(0, 10);

  const hasPricing = offerSnapshot.some((item) =>
    /price|amount|cost|budget|totalAmount/u.test(item),
  );
  const hasTimeline = offerSnapshot.some((item) =>
    /timeline|first30DayPlan|validUntil/u.test(item),
  );
  const hasScope = offerSnapshot.some((item) =>
    /scope|included|notIncluded|solution/u.test(item),
  );

  const offerClarityGaps = [
    !hasPricing
      ? buildInsight(
          "Offer/proposal context does not include a clear price option.",
          "Pricing clarity gap",
          "Add a plain-language price option, payment expectation, and what is included at that level.",
          ["price"],
        )
      : undefined,
    !hasTimeline
      ? buildInsight(
          "Offer/proposal context does not include a clear timeline.",
          "Timeline clarity gap",
          "Add delivery phases, client responsibilities by phase, and the first measurable milestone.",
          ["timeline"],
        )
      : undefined,
    !hasScope
      ? buildInsight(
          "Offer/proposal context does not include clear scope boundaries.",
          "Scope clarity gap",
          "Add included, not-included, and assumptions sections before the next call.",
          ["scope"],
        )
      : undefined,
  ].filter((item): item is TranscriptInsight => Boolean(item));

  const proposalImprovementNotes = [
    ...missedPainPoints.slice(0, 3).map((pain) => ({
      ...pain,
      summary: "Use this pain in prospect-language proposal copy",
    })),
    ...extractedObjections.slice(0, 3).map((objection) => ({
      ...objection,
      summary: `Pre-handle ${objection.category} in the proposal`,
    })),
    ...offerClarityGaps,
  ];

  return {
    id: input.reportId ?? `call_insight_report_${input.callTranscript.id}`,
    createdAt,
    callTranscriptId: input.callTranscript.id,
    leadId: input.callTranscript.leadId,
    clientId: input.callTranscript.clientId,
    proposalId: input.callTranscript.proposalId,
    extractedObjections,
    missedBuyingSignals,
    missedPainPoints,
    betterFollowUpQuestions: [
      "When this problem happens, what does it cost in missed revenue, team time, or customer experience?",
      "Who else needs to feel confident before you can approve the next step?",
      "What would make this feel safe enough to start in the next 30 days?",
      "Which current tools or workflows must we preserve, replace, or integrate with?",
      "If nothing changes for another quarter, what becomes harder or more expensive?",
      "What proof, milestone, or checkpoint would make you confident this is working?",
    ],
    reframeSuggestions: extractedObjections.map((objection) => ({
      summary: `Reframe ${objection.category}`,
      evidence: objection.evidence,
      recommendation: objection.responseAngle,
      confidence: objection.confidence,
    })),
    proposalImprovementNotes: uniqueBySummary(proposalImprovementNotes).slice(
      0,
      12,
    ),
    offerClarityGaps,
    deliveryRiskFlags,
    nextCallPrepNotes: [
      "Open by restating the top pain point in the prospect’s words and ask for confirmation.",
      "Bring a concise objection map with proof, scope boundaries, access needs, and decision-maker questions.",
      "Ask for a mutual next step before reviewing detailed implementation work.",
      ...deliveryRiskFlags
        .slice(0, 3)
        .map((risk) => `Confirm risk/dependency: ${risk.evidence}`),
    ],
    sourceSnapshot: {
      transcriptSummary: input.callTranscript.summary,
      prospectContext: prospectSnapshot,
      offerProposalContext: offerSnapshot,
    },
  };
}
