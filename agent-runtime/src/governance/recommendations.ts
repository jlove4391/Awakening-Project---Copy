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
  draft?: string;
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
    draft?: string;
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
    ...(input.draft ? { draft: input.draft } : {}),
    status: 'open',
    mode: 'observation',
  };
  await ensureStore();
  await fs.writeFile(recommendationPath(recommendation.id), `${JSON.stringify(recommendation, null, 2)}\n`);
  return recommendation;
}
