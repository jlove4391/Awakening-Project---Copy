import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runtimeConfig } from '../src/config.js';
import { googleAuthStatus } from '../src/providers/google/auth.js';
import { listExecutionRecords } from '../src/executions.js';
import { executeRegisteredTool } from '../src/tools/registry.js';
import type { RuntimeContext } from '../src/types.js';

function requiredEnv(name: string) {
  if (!process.env[name]?.trim()) throw new Error(`${name} is required in the runtime environment.`);
}

function parseIntegerEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

async function tailJsonl(filePath: string, predicate: (entry: Record<string, unknown>) => boolean) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .reverse()
      .find(predicate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function main() {
  requiredEnv('GOOGLE_CLIENT_ID');
  requiredEnv('GOOGLE_CLIENT_SECRET');
  requiredEnv('GOOGLE_REDIRECT_URI');
  if (!process.env.GOOGLE_TOKEN_STORE_KEY && !process.env.MASTER_KEY) {
    throw new Error('GOOGLE_TOKEN_STORE_KEY or MASTER_KEY is required in the runtime environment.');
  }

  const google = googleAuthStatus();
  if (!google.linked) {
    throw new Error('Google is not linked. Start the runtime, visit GET /api/auth/google/start, complete the callback, then rerun this script.');
  }

  const now = new Date();
  const defaultTimeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sessionId = process.env.SMOKE_SESSION_ID || 'local-google-calendar-smoke';
  const input = {
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    timeMin: process.env.SMOKE_TIME_MIN || now.toISOString(),
    timeMax: process.env.SMOKE_TIME_MAX || defaultTimeMax.toISOString(),
    maxResults: parseIntegerEnv('SMOKE_MAX_RESULTS', 10),
  };

  const context = {
    sessionId,
    agent: 'elora',
  } as RuntimeContext;

  const result = await executeRegisteredTool('calendar.list_events', input, context);
  const executions = await listExecutionRecords({ sessionId, limit: 5 });
  const latestExecution = executions.find((record) => record.action === 'calendar.list_events');
  const auditLogPath = path.join(runtimeConfig.dataDir, 'audit', 'tool-audit.jsonl');
  const auditEntry = await tailJsonl(
    auditLogPath,
    (entry) => entry.tool === 'calendar.list_events' && entry.sessionId === sessionId && entry.resultStatus === 'completed',
  );

  console.log(JSON.stringify({
    ok: true,
    google,
    input,
    result,
    execution: latestExecution,
    audit: {
      path: auditLogPath,
      entry: auditEntry,
    },
    receiptsUrl: `/api/executions?sessionId=${encodeURIComponent(sessionId)}&limit=5`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
