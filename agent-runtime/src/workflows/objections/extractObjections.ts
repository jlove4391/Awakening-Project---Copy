import type { CallTranscriptRecord } from "@awakening/shared";
import type {
  OfferProposalContext,
  ProspectContext,
} from "./createCallInsightReport.js";
import {
  ObjectionCategorySchema,
  type ObjectionCategory,
  type ObjectionRecord,
} from "./types.js";

export type ObjectionSeverity = "low" | "medium" | "high" | "critical";
export type FollowUpOwner = "sales" | "solutions" | "delivery" | "legal" | "finance" | "leadership";

export interface ExtractObjectionsInput {
  callTranscript: CallTranscriptRecord;
  prospectContext?: ProspectContext;
  offerProposalContext?: OfferProposalContext;
  createdAt?: string | Date;
  status?: string;
}

export interface ExtractedObjectionRecord extends ObjectionRecord {
  category: ObjectionCategory;
  summary: string;
  resolution: string;
  metadata: ObjectionRecord["metadata"] & {
    quote: string;
    severity: ObjectionSeverity;
    recommendedResponseStrategy: string;
    followUpOwner: FollowUpOwner;
    confidence: "low" | "medium" | "high";
    source: "extractObjections";
  };
}

type ObjectionPattern = {
  category: ObjectionCategory;
  keywords: string[];
  summary: string;
  recommendedResponseStrategy: string;
  followUpOwner: FollowUpOwner;
  baseSeverity: ObjectionSeverity;
};

const OBJECTION_PATTERNS: ObjectionPattern[] = [
  {
    category: "price",
    keywords: ["too expensive", "cost", "price", "budget", "afford", "cheaper", "discount", "money"],
    summary: "Pricing or budget concern",
    recommendedResponseStrategy:
      "Connect the investment to quantified impact, compare it with the cost of inaction, and offer the smallest safe scope if budget is truly constrained.",
    followUpOwner: "sales",
    baseSeverity: "high",
  },
  {
    category: "timing",
    keywords: ["not now", "later", "next quarter", "busy", "bad time", "timing", "too soon", "after"],
    summary: "Timing concern",
    recommendedResponseStrategy:
      "Clarify what must happen before the buyer can move, identify the cost of delay, and propose a low-lift next milestone.",
    followUpOwner: "sales",
    baseSeverity: "medium",
  },
  {
    category: "trust",
    keywords: ["trust", "proof", "case study", "reference", "guarantee", "results", "believe", "skeptical"],
    summary: "Trust or proof concern",
    recommendedResponseStrategy:
      "Provide relevant proof, name the assumptions behind expected outcomes, and create a visible checkpoint instead of overpromising.",
    followUpOwner: "sales",
    baseSeverity: "high",
  },
  {
    category: "complexity",
    keywords: ["complicated", "complex", "overwhelming", "hard to use", "confusing", "too much"],
    summary: "Complexity concern",
    recommendedResponseStrategy:
      "Simplify the implementation into phases, show what changes first, and confirm the buyer's preferred level of operational detail.",
    followUpOwner: "solutions",
    baseSeverity: "medium",
  },
  {
    category: "already have a tool",
    keywords: ["already have", "using", "current tool", "crm", "software", "platform", "system"],
    summary: "Existing tool or vendor concern",
    recommendedResponseStrategy:
      "Acknowledge existing investments and position the offer around workflow improvement, adoption, integration, or gaps the current tool does not solve.",
    followUpOwner: "solutions",
    baseSeverity: "medium",
  },
  {
    category: "need to talk to partner/team",
    keywords: ["partner", "team", "boss", "owner", "decision maker", "talk to", "check with", "run it by"],
    summary: "Additional decision-maker concern",
    recommendedResponseStrategy:
      "Equip the champion with a concise business case and invite decision makers into a next conversation with clear questions to resolve.",
    followUpOwner: "sales",
    baseSeverity: "high",
  },
  {
    category: "unclear ROI",
    keywords: ["roi", "return", "worth it", "pay for itself", "value", "benefit", "impact"],
    summary: "ROI clarity concern",
    recommendedResponseStrategy:
      "Quantify missed opportunities, labor savings, response-time gains, and revenue protection before revisiting scope or price.",
    followUpOwner: "sales",
    baseSeverity: "high",
  },
  {
    category: "fear of AI",
    keywords: ["ai", "robot", "automated", "automation", "impersonal", "replace", "human touch"],
    summary: "AI adoption concern",
    recommendedResponseStrategy:
      "Frame AI as human-controlled assistance, define approval boundaries, and explain where human judgment remains required.",
    followUpOwner: "solutions",
    baseSeverity: "medium",
  },
  {
    category: "privacy/compliance",
    keywords: ["privacy", "compliance", "secure", "security", "data", "legal", "permission", "hipaa", "gdpr"],
    summary: "Privacy, security, or compliance concern",
    recommendedResponseStrategy:
      "Document data handling, permissions, retention, access boundaries, and any required compliance review before asking for commitment.",
    followUpOwner: "legal",
    baseSeverity: "critical",
  },
  {
    category: "implementation burden",
    keywords: ["setup", "implement", "training", "time to build", "capacity", "bandwidth", "lift", "onboarding"],
    summary: "Implementation burden concern",
    recommendedResponseStrategy:
      "Make client responsibilities, access needs, training requirements, and first-week lift explicit; reduce scope where burden is too high.",
    followUpOwner: "delivery",
    baseSeverity: "high",
  },
  {
    category: "bad past vendor experience",
    keywords: ["bad experience", "last vendor", "burned", "didn't deliver", "did not deliver", "failed before", "promised"],
    summary: "Prior vendor disappointment concern",
    recommendedResponseStrategy:
      "Acknowledge the prior miss, ask what went wrong, and propose tighter milestones, visibility, acceptance criteria, and approval gates.",
    followUpOwner: "leadership",
    baseSeverity: "high",
  },
];

function timestamp(value: string | Date | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date().toISOString();
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function transcriptText(record: CallTranscriptRecord) {
  return clean(record.transcript) || clean(record.summary);
}

function sentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(clean)
    .filter(Boolean);
}

function includesAny(value: string, keywords: string[]) {
  const lower = value.toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function severityFor(baseSeverity: ObjectionSeverity, evidence: string, matchCount: number): ObjectionSeverity {
  const urgentLanguage = /\b(blocker|deal breaker|can't|cannot|won't|never|no way|must have|legal|security)\b/iu.test(evidence);
  if (urgentLanguage || matchCount > 2) {
    if (baseSeverity === "critical" || /\b(legal|security|compliance|privacy|data)\b/iu.test(evidence)) return "critical";
    return "high";
  }
  if (baseSeverity === "critical") return "high";
  if (baseSeverity === "high" && evidence.length < 80 && matchCount === 1) return "medium";
  return baseSeverity;
}

function confidenceFor(evidence: string, matchCount: number): "low" | "medium" | "high" {
  if (matchCount > 1 || evidence.length > 140) return "high";
  return evidence.length > 70 ? "medium" : "low";
}

function contextClues(context: ProspectContext | OfferProposalContext | undefined) {
  if (!context || typeof context !== "object") return "";
  return Object.entries(context as Record<string, unknown>)
    .flatMap(([key, value]) => {
      if (value == null || typeof value === "object") return [];
      const normalized = clean(value);
      return normalized ? [`${key}: ${normalized}`] : [];
    })
    .slice(0, 8)
    .join("; ");
}

function stableId(parts: string[]) {
  const source = parts.join("::");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `objection_${hash.toString(16).padStart(8, "0")}`;
}

function uniqueByCategoryAndQuote(items: ExtractedObjectionRecord[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.category}::${item.metadata.quote.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractObjections(input: ExtractObjectionsInput): ExtractedObjectionRecord[] {
  const transcript = transcriptText(input.callTranscript);
  const lines = sentences(transcript);
  const now = timestamp(input.createdAt);
  const prospectSnapshot = contextClues(input.prospectContext);
  const offerSnapshot = contextClues(input.offerProposalContext);

  const records = OBJECTION_PATTERNS.flatMap((pattern) =>
    lines.flatMap((line) => {
      const matches = includesAny(line, pattern.keywords);
      if (matches.length === 0) return [];

      const severity = severityFor(pattern.baseSeverity, line, matches.length);
      const category = ObjectionCategorySchema.parse(pattern.category);
      const summary = `${pattern.summary}: ${line}`;
      const strategy = [
        pattern.recommendedResponseStrategy,
        prospectSnapshot ? `Use prospect context when responding (${prospectSnapshot}).` : "Confirm the buyer's exact concern before responding.",
        offerSnapshot ? `Tie the response to offer/proposal specifics (${offerSnapshot}).` : "If offer details are missing, clarify price, scope, timeline, and proof before pushing for a next step.",
      ].join(" ");

      const record: ExtractedObjectionRecord = {
        id: stableId([input.callTranscript.id, category, line]),
        createdAt: now,
        updatedAt: now,
        status: input.status ?? "open",
        leadId: input.callTranscript.leadId ?? "",
        clientId: input.callTranscript.clientId ?? "",
        proposalId: input.callTranscript.proposalId ?? "",
        sessionId: input.callTranscript.sessionId ?? "",
        callTranscriptId: input.callTranscript.id,
        category,
        summary,
        resolution: strategy,
        metadata: {
          quote: line,
          severity,
          recommendedResponseStrategy: strategy,
          followUpOwner: pattern.followUpOwner,
          confidence: confidenceFor(line, matches.length),
          source: "extractObjections",
        },
      };

      return [record];
    }),
  );

  return uniqueByCategoryAndQuote(records).slice(0, 12);
}

export default extractObjections;
