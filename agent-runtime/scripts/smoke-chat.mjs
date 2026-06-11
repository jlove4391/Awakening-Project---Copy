#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(scriptDir, '..');
const defaultDataDir = path.join(runtimeRoot, '.runtime-data');

const options = parseArgs(process.argv.slice(2));
const runtimeUrl = trimTrailingSlash(options.url || process.env.AGENT_RUNTIME_URL || 'http://localhost:4317');
const agent = options.agent || 'elora';
const message = options.message || 'Hello Elora. Confirm the runtime loop is alive.';
const dataDir = path.resolve(options.dataDir || process.env.AGENT_RUNTIME_DATA_DIR || defaultDataDir);
const timeoutMs = Number(options.timeoutMs || process.env.SMOKE_CHAT_TIMEOUT_MS || 120000);
const endpoint = `${runtimeUrl}/api/chat`;

if (options.help) {
  printHelp();
  process.exit(0);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  fail(`Invalid timeout: ${options.timeoutMs}`);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);

try {
  console.log(`Smoke chat: POST ${endpoint}`);
  console.log(`Agent: ${agent}`);
  console.log(`Data dir: ${dataDir}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, agent, sessionId: options.sessionId }),
    signal: controller.signal,
  });

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    fail(`Expected an SSE response from ${endpoint}, got ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`);
  }

  const observed = await readSse(response.body);
  await validateSmokeResult(observed, dataDir);

  console.log('Smoke chat passed.');
  console.log(`Session: ${observed.sessionId}`);
  console.log(`Events: ${Array.from(observed.eventNames).join(', ')}`);
  console.log(`Delta characters: ${observed.deltaText.length}`);
  console.log(`Session file: ${observed.sessionFile}`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  clearTimeout(timeout);
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    const [rawKey, inlineValue] = arg.startsWith('--') ? arg.slice(2).split('=', 2) : [undefined, undefined];
    if (!rawKey) fail(`Unknown argument: ${arg}`);

    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${rawKey}`);
    parsed[key] = value;
    if (inlineValue === undefined) index += 1;
  }
  return parsed;
}

async function readSse(body) {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  const observed = {
    eventNames: new Set(),
    events: [],
    deltaText: '',
    sessionId: undefined,
    completed: undefined,
    sessionFile: undefined,
  };
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() || '';
    for (const frame of frames) handleFrame(frame, observed);
  }

  buffer += decoder.decode();
  if (buffer.trim()) handleFrame(buffer, observed);
  return observed;
}

function handleFrame(frame, observed) {
  const lines = frame.split(/\r?\n/);
  let event = 'message';
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    if (field === 'data') dataLines.push(value);
  }

  const rawData = dataLines.join('\n');
  const data = rawData ? parseJson(rawData, event) : null;
  observed.eventNames.add(event);
  observed.events.push({ event, data });

  if (event === 'session') observed.sessionId = data?.sessionId;
  if (event === 'delta') observed.deltaText += data?.text || '';
  if (event === 'completed') observed.completed = data;
  if (event === 'error') fail(`Runtime emitted error event: ${data?.message || rawData || 'unknown error'}`);
}

async function validateSmokeResult(observed, dataDir) {
  for (const requiredEvent of ['session', 'memory', 'completed']) {
    if (!observed.eventNames.has(requiredEvent)) fail(`Missing required SSE event: ${requiredEvent}`);
  }

  if (!observed.sessionId) fail('The session event did not include a sessionId.');

  const hasDelta = observed.eventNames.has('delta') && observed.deltaText.trim().length > 0;
  const completionText = extractCompletionText(observed.completed);
  if (!hasDelta && !completionText) {
    fail('Expected one or more delta frames or a usable completed.finalOutput payload.');
  }

  const sessionFile = path.join(dataDir, 'sessions', `${observed.sessionId}.json`);
  observed.sessionFile = sessionFile;
  if (!existsSync(sessionFile)) {
    fail(`Expected persisted session file at ${sessionFile}`);
  }

  const sessionRecord = await readJson(sessionFile);
  if (sessionRecord?.id !== observed.sessionId) {
    fail(`Persisted session JSON at ${sessionFile} did not contain the expected id ${observed.sessionId}.`);
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not read persisted session JSON at ${filePath}: ${error.message}`);
  }
}

function extractCompletionText(completed) {
  const output = completed?.finalOutput;
  if (typeof output === 'string') return output.trim();
  if (typeof output?.visibleReply === 'string') return output.visibleReply.trim();
  if (typeof completed?.text === 'string') return completed.text.trim();
  return '';
}

function parseJson(rawData, event) {
  try {
    return JSON.parse(rawData);
  } catch (error) {
    fail(`Invalid JSON in ${event} SSE frame: ${error.message}`);
  }
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function printHelp() {
  console.log(`Usage: node agent-runtime/scripts/smoke-chat.mjs [options]\n\nOptions:\n  --url <url>             Agent runtime base URL (default: AGENT_RUNTIME_URL or http://localhost:4317)\n  --agent <name>          Agent name to send to /api/chat (default: elora)\n  --message <text>        Message to send (default: local Elora loop confirmation prompt)\n  --session-id <id>       Reuse a specific runtime session ID\n  --data-dir <path>       Runtime data directory (default: AGENT_RUNTIME_DATA_DIR or agent-runtime/.runtime-data)\n  --timeout-ms <ms>       Request timeout (default: SMOKE_CHAT_TIMEOUT_MS or 120000)\n  --help                  Show this help\n`);
}

function fail(message) {
  console.error(`Smoke chat failed: ${message}`);
  process.exit(1);
}
