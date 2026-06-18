import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runtimeConfig } from '../config.js';
import type { RuntimeContext } from '../types.js';

export type RecommendationLinkType = 'file' | 'task' | 'receipt' | 'memory' | 'other';

export interface ObservationRecommendationLink {
  type: RecommendationLinkType;
  id: string;
  label?: string;
}

export interface ObservationRecommendation {
  id: string;
  sessionId: string;
  agent: string;
  createdAt: string;
  title: string;
  summary: string;
  rationale: string;
  recommendedAction: string;
  links: ObservationRecommendationLink[];
  affectedPaths: string[];
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  rank?: number;
  draft?: string;
  draftPatchProposal?: string;
  status: 'open';
  mode: 'observation';
}

const recommendationsDir = path.join(runtimeConfig.dataDir, 'recommendations');

async function ensureStore() {
  await fs.mkdir(recommendationsDir, { recursive: true });
}

function recommendationPath(id: string) {
  return path.join(recommendationsDir, `${id}.json`);
}

function sanitizeAffectedPaths(paths: string[]) {
  return [...new Set(paths.map((item) => item.trim()).filter(Boolean))];
}

function sanitizeConfidence(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function sanitizeLinks(links: ObservationRecommendationLink[]) {
  return links.map((link) => ({
    type: link.type,
    id: link.id,
    ...(link.label ? { label: link.label } : {}),
  }));
}

export async function createObservationRecommendation(
  input: Pick<ObservationRecommendation, 'title' | 'summary' | 'rationale' | 'recommendedAction'> & {
    links?: ObservationRecommendationLink[];
    affectedPaths?: string[];
    confidence?: number;
    risk?: 'low' | 'medium' | 'high';
    rank?: number;
    draft?: string;
    draftPatchProposal?: string;
  },
  context: RuntimeContext,
) {
  const recommendation: ObservationRecommendation = {
    id: `orec_${randomUUID()}`,
    sessionId: context.sessionId,
    agent: context.agent || 'elora',
    createdAt: new Date().toISOString(),
    title: input.title,
    summary: input.summary,
    rationale: input.rationale,
    recommendedAction: input.recommendedAction,
    links: sanitizeLinks(input.links || []),
    affectedPaths: sanitizeAffectedPaths(input.affectedPaths || []),
    confidence: sanitizeConfidence(input.confidence),
    risk: input.risk || 'medium',
    ...(input.rank ? { rank: input.rank } : {}),
    ...(input.draft ? { draft: input.draft } : {}),
    ...(input.draftPatchProposal ? { draftPatchProposal: input.draftPatchProposal } : {}),
    status: 'open',
    mode: 'observation',
  };
  await ensureStore();
  await fs.writeFile(recommendationPath(recommendation.id), `${JSON.stringify(recommendation, null, 2)}\n`);
  return recommendation;
}
