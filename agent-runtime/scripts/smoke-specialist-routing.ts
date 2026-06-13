#!/usr/bin/env tsx

type RuntimeAgentName = 'nexora' | 'kaz' | 'jynx' | 'kalyra';

type SmokeCase = {
  agent: RuntimeAgentName;
  label: string;
  expected: string[];
  prompt: string;
};

type ObservedEvent = {
  event: string;
  data: unknown;
};

type ObservedResponse = {
  eventNames: Set<string>;
  events: ObservedEvent[];
  deltaText: string;
  sessionId?: string;
  completed?: Record<string, unknown>;
};

type Options = {
  help?: boolean;
  url?: string;
  timeoutMs?: string;
  sessionPrefix?: string;
};

const options = parseArgs(process.argv.slice(2));
const runtimeUrl = trimTrailingSlash(options.url || process.env.AGENT_RUNTIME_URL || 'http://localhost:4317');
const timeoutMs = Number(options.timeoutMs || process.env.SMOKE_SPECIALISTS_TIMEOUT_MS || 120000);
const sessionPrefix = options.sessionPrefix || process.env.SMOKE_SPECIALISTS_SESSION_PREFIX || 'specialist-routing-smoke';
const endpoint = `${runtimeUrl}/api/chat`;

const smokeCases: SmokeCase[] = [
  {
    agent: 'nexora',
    label: 'Nexora tech diagnostic draft',
    expected: ['nexora', 'tech diagnostic draft'],
    prompt: [
      'Create a concise internal tech diagnostic draft for a client whose CRM automations, Google Workspace handoffs, and reporting integrations are failing.',
      'Do not call tools or send anything externally.',
      'Include either the phrase "Specialist: Nexora" or the heading "Tech Diagnostic Draft" in the visible response.',
    ].join(' '),
  },
  {
    agent: 'kaz',
    label: 'Kaz SOP/process draft',
    expected: ['kaz', 'sop/process draft', 'sop draft', 'process draft'],
    prompt: [
      'Create a concise internal SOP/process draft for a client onboarding handoff with unclear owners, bottlenecks, and missing quality checks.',
      'Do not call tools or send anything externally.',
      'Include either the phrase "Specialist: Kaz" or the heading "SOP/Process Draft" in the visible response.',
    ].join(' '),
  },

  {
    agent: 'kalyra',
    label: 'Kalyra buyer-readiness draft',
    expected: ['kalyra', 'buyer-readiness draft', 'buyer readiness draft'],
    prompt: [
      'Create a concise internal buyer-readiness draft for a proposal review call with buyer priorities, pain points, objections, missed buying signals, and welcome language.',
      'Do not call tools or send anything externally. Do not use manipulative pressure or make promises without Jordan approval.',
      'Include either the phrase "Specialist: Kalyra" or the heading "Buyer-Readiness Draft" in the visible response.',
    ].join(' '),
  },
  {
    agent: 'jynx',
    label: 'Jynx finance ops diagnostic draft',
    expected: ['jynx', 'finance ops diagnostic draft', 'finance operations diagnostic'],
    prompt: [
      'Create a concise internal finance ops diagnostic draft for a client with invoice delays, weak cash-flow visibility, and unclear payment follow-up ownership.',
      'Do not call tools or send anything externally.',
      'Include either the phrase "Specialist: Jynx" or the heading "Finance Ops Diagnostic Draft" in the visible response.',
    ].join(' '),
  },
];

if (options.help) {
  printHelp();
  process.exit(0);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  fail(`Invalid timeout: ${options.timeoutMs}`);
}

console.log(`Specialist routing smoke: POST ${endpoint}`);
console.log(`Cases: ${smokeCases.map((item) => item.label).join(', ')}`);

for (const [index, smokeCase] of smokeCases.entries()) {
  const observed = await runSmokeCase(smokeCase, index);
  validateSmokeCase(smokeCase, observed);
  const responseText = extractResponseText(observed);
  console.log(`✓ ${smokeCase.label} completed (${responseText.length} response characters).`);
}

console.log('Specialist routing smoke passed.');

async function runSmokeCase(smokeCase: SmokeCase, index: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  const sessionId = `${sessionPrefix}-${smokeCase.agent}-${Date.now()}-${index}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent: smokeCase.agent,
        message: smokeCase.prompt,
        sessionId,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      fail(`Expected an SSE response for ${smokeCase.label}, got ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`);
    }

    return await readSse(response.body);
  } finally {
    clearTimeout(timeout);
  }
}

async function readSse(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  const observed: ObservedResponse = {
    eventNames: new Set(),
    events: [],
    deltaText: '',
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

function handleFrame(frame: string, observed: ObservedResponse) {
  const lines = frame.split(/\r?\n/);
  let event = 'message';
  const dataLines: string[] = [];

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

  if (event === 'session' && isRecord(data)) observed.sessionId = stringValue(data.sessionId);
  if (event === 'delta' && isRecord(data)) observed.deltaText += stringValue(data.text) || '';
  if (event === 'completed' && isRecord(data)) observed.completed = data;
  if (event === 'error') {
    const message = isRecord(data) ? stringValue(data.message) : '';
    fail(`Runtime emitted error event: ${message || rawData || 'unknown error'}`);
  }
}

function validateSmokeCase(smokeCase: SmokeCase, observed: ObservedResponse) {
  for (const requiredEvent of ['session', 'memory', 'completed']) {
    if (!observed.eventNames.has(requiredEvent)) fail(`${smokeCase.label} missing required SSE event: ${requiredEvent}`);
  }

  if (!observed.sessionId) fail(`${smokeCase.label} session event did not include a sessionId.`);
  if (!observed.completed) fail(`${smokeCase.label} did not include a completed event payload.`);

  const completedAgent = stringValue(observed.completed.agent);
  if (completedAgent !== smokeCase.agent) {
    fail(`${smokeCase.label} completed with agent ${completedAgent || '<missing>'}, expected ${smokeCase.agent}.`);
  }

  const responseText = extractResponseText(observed);
  if (!responseText) fail(`${smokeCase.label} completed without response text or visibleReply.`);

  const normalized = responseText.toLowerCase();
  const matchedExpectedPhrase = smokeCase.expected.some((phrase) => normalized.includes(phrase));
  if (!matchedExpectedPhrase) {
    fail(`${smokeCase.label} response did not include specialist name or expected draft category. Expected one of: ${smokeCase.expected.join(', ')}`);
  }
}

function extractResponseText(observed: ObservedResponse) {
  const finalOutput = observed.completed?.finalOutput;
  const completedText = stringValue(observed.completed?.text);
  if (typeof finalOutput === 'string') return finalOutput.trim();
  if (isRecord(finalOutput)) {
    const visibleReply = stringValue(finalOutput.visibleReply);
    if (visibleReply) return visibleReply.trim();
  }
  return (observed.deltaText || completedText || '').trim();
}

function parseArgs(args: string[]) {
  const parsed: Options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    const [rawKey, inlineValue] = arg.startsWith('--') ? arg.slice(2).split('=', 2) : [undefined, undefined];
    if (!rawKey) fail(`Unknown argument: ${arg}`);

    const key = rawKey.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof Options;
    const value = inlineValue ?? args[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${rawKey}`);
    parsed[key] = value as never;
    if (inlineValue === undefined) index += 1;
  }
  return parsed;
}

function parseJson(rawData: string, event: string) {
  try {
    return JSON.parse(rawData) as unknown;
  } catch (error) {
    fail(`Invalid JSON in ${event} SSE frame: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function printHelp() {
  console.log(`Usage: tsx agent-runtime/scripts/smoke-specialist-routing.ts [options]\n\nOptions:\n  --url <url>                  Agent runtime base URL (default: AGENT_RUNTIME_URL or http://localhost:4317)\n  --session-prefix <prefix>    Session ID prefix (default: SMOKE_SPECIALISTS_SESSION_PREFIX or specialist-routing-smoke)\n  --timeout-ms <ms>            Per-request timeout (default: SMOKE_SPECIALISTS_TIMEOUT_MS or 120000)\n  --help                       Show this help\n`);
}

function fail(message: string): never {
  console.error(`Specialist routing smoke failed: ${message}`);
  process.exit(1);
}
