import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import { recordTrustEvent } from '../governance/trustService.js';
import type { RelationshipContext, RelationshipProfile, RelationshipProfileEntry, RecordRelationshipEntryInput } from './relationshipTypes.js';

const relationshipDir = path.join(runtimeConfig.dataDir, 'relationship');
const defaultSubjectId = 'jordan';
const sectionNames = ['preferences', 'goals', 'corrections', 'workingStyle', 'recurringContexts', 'longTermObjectives'] as const;
let cache = new Map<string, RelationshipProfile>();
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(relationshipDir, { recursive: true });
}

function profilePath(subjectId: string) {
  return path.join(relationshipDir, `${subjectId}.json`);
}

function emptyProfile(subjectId = defaultSubjectId): RelationshipProfile {
  const timestamp = now();
  return {
    subjectId,
    displayName: subjectId === defaultSubjectId ? 'Jordan' : subjectId,
    preferences: [],
    goals: [],
    corrections: [],
    workingStyle: [],
    recurringContexts: [],
    longTermObjectives: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function loadProfile(subjectId = defaultSubjectId) {
  if (cache.has(subjectId)) return cache.get(subjectId)!;
  await ensureStore();
  try {
    const profile = JSON.parse(await fs.readFile(profilePath(subjectId), 'utf8')) as RelationshipProfile;
    cache.set(subjectId, profile);
    return profile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const profile = emptyProfile(subjectId);
    cache.set(subjectId, profile);
    await persistProfile(profile);
    return profile;
  }
}

async function persistProfile(profile: RelationshipProfile) {
  await ensureStore();
  profile.updatedAt = now();
  cache.set(profile.subjectId, profile);
  await fs.writeFile(profilePath(profile.subjectId), `${JSON.stringify(profile, null, 2)}\n`);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

function normalizeImportance(value: number | undefined) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0.5));
}

function summarize(entries: RelationshipProfileEntry[], limit = 5) {
  return entries
    .slice()
    .sort((left, right) => right.importance - left.importance || right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit)
    .map((entry) => `- ${entry.text}`)
    .join('\n');
}

export async function recordRelationshipEntry(input: RecordRelationshipEntryInput) {
  return serializedWrite(async () => {
    const profile = await loadProfile(input.subjectId || defaultSubjectId);
    const timestamp = now();
    const entry: RelationshipProfileEntry = {
      id: `rel_${randomUUID()}`,
      text: input.text.trim(),
      source: input.source || 'user',
      tags: input.tags || [],
      importance: normalizeImportance(input.importance),
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    profile[input.section].unshift(entry);
    await persistProfile(profile);

    if (input.section === 'corrections') {
      await recordTrustEvent({
        domain: 'relationship',
        type: 'user_correction',
        outcome: 'negative',
        actor: 'user',
        action: 'relationship.correction_recorded',
        summary: entry.text,
        metadata: { subjectId: profile.subjectId, tags: entry.tags, importance: entry.importance },
      });
    }

    return entry;
  });
}

export async function recordUserCorrection(text: string, options: Omit<RecordRelationshipEntryInput, 'section' | 'text' | 'source'> = {}) {
  return recordRelationshipEntry({ ...options, section: 'corrections', text, source: 'correction', tags: ['correction', ...(options.tags || [])], importance: options.importance ?? 0.8 });
}

export async function getRelationshipProfile(subjectId = defaultSubjectId) {
  return loadProfile(subjectId);
}

export async function getRelationshipContext(subjectId = defaultSubjectId): Promise<RelationshipContext> {
  const profile = await loadProfile(subjectId);
  return {
    subjectId: profile.subjectId,
    displayName: profile.displayName,
    preferenceSummary: summarize(profile.preferences),
    goalSummary: summarize(profile.goals),
    correctionSummary: summarize(profile.corrections),
    workingStyleSummary: summarize(profile.workingStyle),
    recurringContextSummary: summarize(profile.recurringContexts),
    longTermObjectiveSummary: summarize(profile.longTermObjectives),
    latestCorrections: profile.corrections.slice(0, 5),
    retrievedAt: now(),
  };
}

export async function clearRelationshipProfilesForTesting() {
  return serializedWrite(async () => {
    cache = new Map();
    await ensureStore();
    await Promise.all((await fs.readdir(relationshipDir)).filter((file) => file.endsWith('.json')).map((file) => fs.unlink(path.join(relationshipDir, file))));
  });
}

export const relationshipProfileSections = sectionNames;
