export type RelationshipProfileSection = 'preferences' | 'goals' | 'corrections' | 'workingStyle' | 'recurringContexts' | 'longTermObjectives';

export interface RelationshipProfileEntry {
  id: string;
  text: string;
  source: 'user' | 'agent' | 'system' | 'memory' | 'correction';
  tags: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface RelationshipProfile {
  subjectId: string;
  displayName: string;
  preferences: RelationshipProfileEntry[];
  goals: RelationshipProfileEntry[];
  corrections: RelationshipProfileEntry[];
  workingStyle: RelationshipProfileEntry[];
  recurringContexts: RelationshipProfileEntry[];
  longTermObjectives: RelationshipProfileEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface RelationshipContext {
  subjectId: string;
  displayName: string;
  preferenceSummary: string;
  goalSummary: string;
  correctionSummary: string;
  workingStyleSummary: string;
  recurringContextSummary: string;
  longTermObjectiveSummary: string;
  latestCorrections: RelationshipProfileEntry[];
  retrievedAt: string;
}

export interface RecordRelationshipEntryInput {
  subjectId?: string;
  section: RelationshipProfileSection;
  text: string;
  source?: RelationshipProfileEntry['source'];
  tags?: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}
