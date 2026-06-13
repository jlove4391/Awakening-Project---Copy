import type { CallTranscriptRecord } from "@awakening/shared";
import type {
  OfferProposalContext,
  ProspectContext,
} from "./createCallInsightReport.js";
import type { ObjectionRecord } from "./types.js";

export interface BetterQuestionsPromptInput {
  prospectContext?: ProspectContext;
  transcript?: CallTranscriptRecord | string;
  offer?: OfferProposalContext | string;
  objections?: Array<Partial<ObjectionRecord> | string>;
}

export interface BetterQuestionsPrompt {
  system: string;
  user: string;
}


function safeStringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value).trim();
  }
}

function transcriptText(transcript: BetterQuestionsPromptInput["transcript"]): string {
  if (!transcript) return "Transcript not provided.";
  if (typeof transcript === "string") return transcript.trim() || "Transcript not provided.";

  return [
    transcript.summary ? `Summary: ${transcript.summary}` : "",
    transcript.transcript ? `Transcript:\n${transcript.transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n") || "Transcript not provided.";
}

function objectionText(objection: Partial<ObjectionRecord> | string): string {
  if (typeof objection === "string") return objection.trim();

  return [
    objection.category ? `Category: ${objection.category}` : "",
    objection.summary ? `Summary: ${objection.summary}` : "",
    objection.resolution ? `Resolution: ${objection.resolution}` : "",
    Object.keys(objection.metadata ?? {}).length > 0 ? `Metadata: ${safeStringify(objection.metadata)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function section(title: string, content: string): string {
  return `## ${title}\n${content.trim() || "Not provided."}`;
}

export function createBetterQuestionsPrompt(input: BetterQuestionsPromptInput): BetterQuestionsPrompt {
  const objections = input.objections?.map(objectionText).filter(Boolean) ?? [];

  return {
    system: [
      "You are Kalyra, Jordan's ethical sales coach for post-call objection review.",
      "Your job is to turn prospect context, the sales transcript, offer details, and stated objections into better discovery questions.",
      "Generate questions that help the buyer recognize value, tradeoffs, risk, and next steps in their own words.",
      "Do not use pressure, false urgency, guilt, manipulation, combative objection handling, or assumptive-close language.",
      "Protect buyer autonomy: every question should invite clarity, consent, or reflection.",
      "Identify what Jordan may have missed during discovery before recommending future-call improvements.",
    ].join("\n"),
    user: [
      section("Prospect context", safeStringify(input.prospectContext)),
      section("Transcript", transcriptText(input.transcript)),
      section("Offer", safeStringify(input.offer)),
      section(
        "Objections",
        objections.length > 0
          ? objections
              .map((item, index) => `${index + 1}. ${item}`)
              .join("\n\n")
          : "No explicit objections provided.",
      ),
      section(
        "Task",
        [
          "Analyze the call and produce buyer-centered coaching for Jordan.",
          "Return concise Markdown with these sections:",
          "1. Value-clarifying questions Jordan can ask next, grouped by theme.",
          "2. Gentle objection follow-up questions for each known objection.",
          "3. Discovery gaps: what Jordan may have missed or failed to quantify.",
          "4. Future-call improvements: specific behaviors, sequencing, and wording changes.",
          "5. Guardrails: phrases or tactics Jordan should avoid so the buyer does not feel pressured.",
          "Anchor recommendations to evidence from the transcript when possible. If evidence is missing, say what needs to be confirmed.",
        ].join("\n"),
      ),
    ].join("\n\n"),
  };
}

export const betterQuestionsPrompt = createBetterQuestionsPrompt;
