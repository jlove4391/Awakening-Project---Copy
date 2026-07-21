import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../config.js';
import type { CoreIdentityRecord } from './contextTypes.js';

const identityDir = path.join(runtimeConfig.dataDir, 'core', 'identity');
const identityPath = path.join(identityDir, 'core.json');
let cache: CoreIdentityRecord | undefined;
let writeChain = Promise.resolve();

function now() {
  return new Date().toISOString();
}

function defaultCoreIdentity(): CoreIdentityRecord {
  const timestamp = now();
  return {
    id: 'core',
    name: 'Vireon CORE',
    acronym: 'Co-Operative Relational Evolution',
    category: 'persistent_relational_intelligence',
    sovereignUserId: 'jordan',
    executiveAgent: 'elora',
    technicalOfficer: 'nexora',
    doctrineVersion: 1,
    purpose: 'Preserve relational continuity, coordinate bounded specialist work, execute ordinary work inside the trust envelope, validate outcomes, and leave durable receipts for Jordan.',
    progression: ['memory', 'identity', 'relationship', 'trust', 'autonomy', 'execution'],
    governingPrinciples: [
      'Elora is the single visible executive interface.',
      'Memory and identity continuity precede relationship, trust, autonomy, and execution.',
      'Ordinary internal work should execute with validation and receipts rather than redundant approval prompts.',
      'Real-money, private-data-sensitive, irreversible, public, and external-commitment boundaries require explicit handling.',
      'Specialists operate behind Elora through bounded contracts.',
      'Candidate memory is not governing doctrine until reviewed.',
      'CORE never claims execution, validation, provider activity, or receipts that did not occur.',
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function ensureStore() {
  await fs.mkdir(identityDir, { recursive: true });
}

async function serializedWrite<T>(operation: () => Promise<T>) {
  const next = writeChain.then(operation, operation);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

async function persist(identity: CoreIdentityRecord) {
  await ensureStore();
  cache = identity;
  await fs.writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`);
}

export async function getCoreIdentity(): Promise<CoreIdentityRecord> {
  if (cache) return cache;
  await ensureStore();
  try {
    cache = JSON.parse(await fs.readFile(identityPath, 'utf8')) as CoreIdentityRecord;
    return cache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const identity = defaultCoreIdentity();
    await persist(identity);
    return identity;
  }
}

export async function updateCoreIdentity(patch: Partial<Omit<CoreIdentityRecord, 'id' | 'createdAt'>>) {
  return serializedWrite(async () => {
    const current = await getCoreIdentity();
    const updated: CoreIdentityRecord = {
      ...current,
      ...patch,
      id: 'core',
      createdAt: current.createdAt,
      updatedAt: now(),
    };
    await persist(updated);
    return updated;
  });
}

export function clearCoreIdentityCacheForTesting() {
  cache = undefined;
}
