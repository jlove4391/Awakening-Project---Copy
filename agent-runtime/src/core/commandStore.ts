import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import type { CoreExecutionEnvelope } from './contextTypes.js';
import type {
  CoreCommandAuthority,
  CoreCommandAuthorityDecision,
  CoreCommandEvent,
  CoreCommandLinks,
  CoreCommandRecord,
  CoreCommandState,
  CoreCommandTransitionPatch,
  CreateCoreCommandInput,
} from './commandTypes.js';

const commandsDir = path.join(runtimeConfig.dataDir, 'core', 'commands');
const sessionsDir = path.join(commandsDir, 'sessions');
const globalPath = path.join(commandsDir, 'commands.json');
const eventsPath = path.join(commandsDir, 'command-events.jsonl');
let cache: CoreCommandRecord[] | undefined;
let writeChain = Promise.resolve();

const terminalStates = new Set<CoreCommandState>(['completed', 'blocked', 'failed', 'cancelled']);

const allowedTransitions: Record<CoreCommandState, ReadonlySet<CoreCommandState>> = {
  intent_received: new Set(['context_assembled', 'failed', 'cancelled']),
  context_assembled: new Set(['authority_decided', 'failed', 'cancelled']),
  authority_decided: new Set(['planning', 'approval_pending', 'setup_required', 'blocked', 'failed', 'cancelled']),
  planning: new Set(['executing', 'delegated', 'approval_pending', 'setup_required', 'validating', 'response_synthesized', 'blocked', 'failed', 'cancelled']),
  executing: new Set(['delegated', 'approval_pending', 'setup_required', 'validating', 'response_synthesized', 'blocked', 'failed', 'cancelled']),
  delegated: new Set(['executing', 'approval_pending', 'setup_required', 'validating', 'response_synthesized', 'blocked', 'failed', 'cancelled']),
  approval_pending: new Set(['planning', 'cancelled', 'blocked', 'failed']),
  setup_required: new Set(['planning', 'cancelled', 'blocked', 'failed']),
  validating: new Set(['receipted', 'blocked', 'failed', 'cancelled']),
  receipted: new Set(['memory_candidates_recorded', 'blocked', 'failed']),
  memory_candidates_recorded: new Set(['response_synthesized', 'blocked', 'failed']),
  response_synthesized: new Set(['completed', 'blocked', 'failed', 'cancelled']),
  completed: new Set(),
  blocked: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

function now() {
  return new Date().toISOString();
}

function safeFileName(value: string) {
  return value.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 160) || 'session';
}

function unique(values: string[] = []) {
  return [...new Set(values.filter(Boolean))];
}

function mergeLinks(current: CoreCommandLinks, patch: Partial<CoreCommandLinks> = {}): CoreCommandLinks {
  return {
    identityIds: unique([...(current.identityIds || []), ...(patch.identityIds || [])]),
    memoryReferenceIds: unique([...(current.memoryReferenceIds || []), ...(patch.memoryReferenceIds || [])]),
    memoryCandidateIds: unique([...(current.memoryCandidateIds || []), ...(patch.memoryCandidateIds || [])]),
    relationshipEntryIds: unique([...(current.relationshipEntryIds || []), ...(patch.relationshipEntryIds || [])]),
    priorCommandIds: unique([...(current.priorCommandIds || []), ...(patch.priorCommandIds || [])]),
    taskIds: unique([...(current.taskIds || []), ...(patch.taskIds || [])]),
    executionIds: unique([...(current.executionIds || []), ...(patch.executionIds || [])]),
    receiptIds: unique([...(current.receiptIds || []), ...(patch.receiptIds || [])]),
    trustDomains: unique([...(current.trustDomains || []), ...(patch.trustDomains || [])]),
  };
}

async function ensureStore() {
  await fs.mkdir(sessionsDir, { recursive: true });
}

async function loadCommands() {
  if (cache) return cache;
  await ensureStore();
  try {
    cache = JSON.parse(await fs.readFile(globalPath, 'utf8')) as CoreCommandRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    cache = [];
    await fs.writeFile(globalPath, '[]\n');
  }
  return cache;
}

async function persistCommands() {
  await ensureStore();
  const commands = cache || [];
  await fs.writeFile(globalPath, `${JSON.stringify(commands, null, 2)}\n`);
  const sessionIds = [...new Set(commands.map((command) => command.sessionId))];
  await Promise.all(sessionIds.map(async (sessionId) => {
    const records = commands.filter((command) => command.sessionId === sessionId);
    await fs.writeFile(path.join(sessionsDir, `${safeFileName(sessionId)}.json`), `${JSON.stringify(records, null, 2)}\n`);
  }));
}

async function appendEvent(event: CoreCommandEvent) {
  await ensureStore();
  await fs.appendFile(eventsPath, `${JSON.stringify(event)}\n`);
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

function eventFor(commandId: string, state: CoreCommandState, summary: string, previousState?: CoreCommandState, details?: Record<string, unknown>): CoreCommandEvent {
  return {
    id: randomUUID(),
    commandId,
    state,
    previousState,
    occurredAt: now(),
    summary,
    ...(details ? { details } : {}),
  };
}

export function assertCoreCommandTransition(from: CoreCommandState, to: CoreCommandState) {
  if (from === to) return;
  if (!allowedTransitions[from].has(to)) throw new Error(`Invalid CORE command transition: ${from} -> ${to}`);
}

export function decideInitialCommandAuthority(input: {
  executionMode: 'reactive' | 'delegated' | 'autonomous' | 'observation';
  autonomyLevel?: number;
  executionEnvelope?: CoreExecutionEnvelope;
}): CoreCommandAuthority {
  const decidedAt = now();
  const envelope = input.executionEnvelope;
  const shared = envelope ? {
    autonomyLevel: envelope.effectiveAutonomyLevel,
    requestedAutonomyLevel: envelope.requestedAutonomyLevel,
    trustDomain: envelope.primaryTrustDomain,
    trustScore: envelope.trustScore,
    autonomyEnvelope: envelope.autonomyEnvelope,
    validationRequirement: envelope.validationRequirement,
    scopeLimit: envelope.scopeLimit,
  } : { autonomyLevel: input.autonomyLevel };
  if (input.executionMode === 'observation') {
    return {
      decision: 'observe_only',
      executionMode: input.executionMode,
      ...shared,
      reason: `Observation mode is read-only. ${envelope?.reasons.join(' ') || 'Tool-level policy still governs each action.'}`,
      decidedAt,
    };
  }
  if (input.executionMode === 'autonomous') {
    return {
      decision: 'trust_scoped',
      executionMode: input.executionMode,
      ...shared,
      reason: `Autonomous work is limited by the assembled trust envelope. ${envelope?.reasons.join(' ') || 'Tool-level policy remains authoritative.'}`,
      decidedAt,
    };
  }
  return {
    decision: 'execute_with_receipts',
    executionMode: input.executionMode,
    ...shared,
    reason: `A direct or delegated founder request authorizes ordinary work while the assembled trust envelope sets validation rigor. ${envelope?.reasons.join(' ') || 'Each tool still enforces explicit boundaries and setup requirements.'}`,
    decidedAt,
  };
}

export async function createCoreCommand(input: CreateCoreCommandInput) {
  return serializedWrite(async () => {
    const commands = await loadCommands();
    const timestamp = now();
    const id = randomUUID();
    const created = eventFor(id, 'intent_received', 'Founder intent received by the Sovereign Command Loop.');
    const command: CoreCommandRecord = {
      id,
      sessionId: input.sessionId,
      agent: input.agent,
      requestText: input.requestText,
      state: 'intent_received',
      context: {},
      links: {
        identityIds: [],
        memoryReferenceIds: [],
        memoryCandidateIds: [],
        relationshipEntryIds: [],
        priorCommandIds: [],
        taskIds: [],
        executionIds: [],
        receiptIds: [],
        trustDomains: [],
      },
      events: [created],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    commands.unshift(command);
    await persistCommands();
    await appendEvent(created);
    return command;
  });
}

export async function getCoreCommand(commandId: string) {
  const commands = await loadCommands();
  return commands.find((command) => command.id === commandId);
}

export async function listCoreCommands(options: { sessionId?: string; limit?: number } = {}) {
  const commands = await loadCommands();
  const limit = Math.max(1, Math.min(options.limit || 25, 100));
  return commands.filter((command) => !options.sessionId || command.sessionId === options.sessionId).slice(0, limit);
}

export async function transitionCoreCommand(commandId: string, state: CoreCommandState, patch: CoreCommandTransitionPatch = {}) {
  return serializedWrite(async () => {
    const commands = await loadCommands();
    const command = commands.find((candidate) => candidate.id === commandId);
    if (!command) throw new Error(`CORE command not found: ${commandId}`);
    assertCoreCommandTransition(command.state, state);
    const previousState = command.state;
    const timestamp = now();
    command.state = state;
    command.authority = patch.authority || command.authority;
    command.context = { ...command.context, ...(patch.context || {}) };
    command.links = mergeLinks(command.links, patch.links);
    if (patch.finalOutput !== undefined) command.finalOutput = patch.finalOutput;
    if (patch.error !== undefined) command.error = patch.error;
    command.updatedAt = timestamp;
    if (terminalStates.has(state)) command.completedAt = timestamp;
    const event = eventFor(command.id, state, patch.summary || `CORE command entered ${state}.`, previousState, patch.details);
    command.events.push(event);
    await persistCommands();
    await appendEvent(event);
    return { command, event };
  });
}

export async function clearCoreCommandsForTesting() {
  return serializedWrite(async () => {
    cache = [];
    await ensureStore();
    await fs.rm(commandsDir, { recursive: true, force: true });
    await ensureStore();
    await fs.writeFile(globalPath, '[]\n');
  });
}

export type { CoreCommandAuthorityDecision };
