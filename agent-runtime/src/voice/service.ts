import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { runtimeConfig } from '../config.js';
import { createTask, remember, updateTask } from '../memory/index.js';
import { runAgentMessage } from '../agentEndpoint.js';
import type { VoiceApprovalPolicy } from '../types.js';

export type VoiceDirection = 'interface' | 'inbound' | 'outbound' | 'meeting';
export type VoiceChannelKind = 'interface_voice' | 'phone_call' | 'meeting';
export type VoiceSessionStatus = 'active' | 'initiated' | 'ended';
export type TranscriptRole = 'caller' | 'participant' | 'agent' | 'system';

export interface VoiceTranscriptEntry {
  id: string;
  role: TranscriptRole;
  text: string;
  at: string;
  audioId?: string;
  speaker?: string;
}

export interface VoiceSessionRecord {
  id: string;
  agentSessionId: string;
  direction: VoiceDirection;
  channelKind: VoiceChannelKind;
  status: VoiceSessionStatus;
  caller?: string;
  callee?: string;
  providerCallId?: string;
  telephonyProvider?: 'twilio' | 'generic';
  streamSid?: string;
  mediaStream?: {
    status: 'waiting' | 'streaming' | 'completed' | 'failed';
    startedAt?: string;
    endedAt?: string;
    receivedFrames: number;
    receivedBytes: number;
    lastSequenceNumber?: string;
    lastError?: string;
  };
  objective?: string;
  missedCallId?: string;
  callbackTaskId?: string;
  callbackApproval?: {
    status: 'required' | 'approved' | 'denied';
    approvedAt?: string;
    approvedBy?: string;
    note?: string;
  };
  meeting?: {
    provider: 'zoom' | 'teams' | 'google_meet' | 'other';
    title?: string;
    joinUrl?: string;
    externalMeetingId?: string;
    botDisplayName?: string;
    adapterStatus?: 'not_configured' | 'join_requested' | 'listening' | 'ended' | 'failed';
    adapterMessage?: string;
    silentMode: boolean;
    speakingConsent: {
      status: 'not_requested' | 'approved' | 'denied';
      approvedAt?: string;
      approvedBy?: string;
      note?: string;
    };
  };
  createdAt: string;
  updatedAt: string;
  approvalPolicy: VoiceApprovalPolicy;
  transcript: VoiceTranscriptEntry[];
  summary?: string;
}

const voiceDir = path.join(runtimeConfig.dataDir, 'voice-sessions');

const OPENAI_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;
const OPENAI_AUDIO_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] as const;

type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];
type OpenAiAudioFormat = (typeof OPENAI_AUDIO_FORMATS)[number];

function isConfiguredOpenAiVoice() {
  return Boolean(runtimeConfig.openaiApiKey);
}

function normalizeVoice(voice?: string): OpenAiTtsVoice {
  if (OPENAI_TTS_VOICES.includes(voice as OpenAiTtsVoice)) return voice as OpenAiTtsVoice;
  if (OPENAI_TTS_VOICES.includes(runtimeConfig.voiceSpeechVoice as OpenAiTtsVoice)) {
    return runtimeConfig.voiceSpeechVoice as OpenAiTtsVoice;
  }
  return 'marin';
}

function normalizeAudioFormat(format?: string): OpenAiAudioFormat {
  if (OPENAI_AUDIO_FORMATS.includes(format as OpenAiAudioFormat)) return format as OpenAiAudioFormat;
  if (OPENAI_AUDIO_FORMATS.includes(runtimeConfig.voiceSpeechFormat as OpenAiAudioFormat)) {
    return runtimeConfig.voiceSpeechFormat as OpenAiAudioFormat;
  }
  return 'mp3';
}

function mimeToExtension(mimeType?: string) {
  if (!mimeType) return 'webm';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpga')) return 'mpga';
  if (mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('webm')) return 'webm';
  return 'webm';
}

function audioFormatToMime(format: string) {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'opus':
      return 'audio/opus';
    case 'aac':
      return 'audio/aac';
    case 'flac':
      return 'audio/flac';
    case 'pcm':
      return 'audio/pcm';
    case 'mp3':
    default:
      return 'audio/mpeg';
  }
}

async function openAiFetch(pathname: string, init: RequestInit) {
  const response = await fetch(`${runtimeConfig.openaiBaseUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${runtimeConfig.openaiApiKey}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI voice request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return response;
}

export function getVoiceRuntimeConfig() {
  return {
    provider: isConfiguredOpenAiVoice() ? 'openai' : 'not_configured',
    transcriptionModel: runtimeConfig.voiceTranscriptionModel,
    speechModel: runtimeConfig.voiceSpeechModel,
    defaultVoice: normalizeVoice(runtimeConfig.voiceSpeechVoice),
    voices: OPENAI_TTS_VOICES,
    responseFormat: normalizeAudioFormat(runtimeConfig.voiceSpeechFormat),
    disclosure: 'Elora browser voice is limited to the conversational text loop; phone telephony remains gated until runtime approvals, receipts, and delegation are stable.',
    telephony: {
      provider: 'twilio',
      configured: isTwilioConfigured(),
      ...telephonyReadiness(),
    },
  };
}

async function transcribeWithOpenAi(input: { audioBase64: string; audioMimeType?: string; language?: string }) {
  if (!isConfiguredOpenAiVoice()) {
    return undefined;
  }

  const audioBuffer = Buffer.from(input.audioBase64, 'base64');
  const audioBlob = new Blob([audioBuffer], { type: input.audioMimeType || 'audio/webm' });
  const form = new FormData();
  form.set('file', audioBlob, `speech.${mimeToExtension(input.audioMimeType)}`);
  form.set('model', runtimeConfig.voiceTranscriptionModel);
  form.set('response_format', 'json');
  if (input.language) form.set('language', input.language);

  const response = await openAiFetch('/audio/transcriptions', {
    method: 'POST',
    body: form,
  });
  const data = (await response.json()) as { text?: string };
  return data.text?.trim() || '';
}

async function synthesizeWithOpenAi(input: { text: string; voice?: string; responseFormat?: string }) {
  if (!isConfiguredOpenAiVoice() || !input.text.trim()) {
    return undefined;
  }

  const responseFormat = normalizeAudioFormat(input.responseFormat);
  const response = await openAiFetch('/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: runtimeConfig.voiceSpeechModel,
      input: input.text,
      voice: normalizeVoice(input.voice),
      instructions: runtimeConfig.voiceSpeechInstructions,
      response_format: responseFormat,
    }),
  });
  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return {
    status: 'completed' as const,
    provider: 'openai',
    model: runtimeConfig.voiceSpeechModel,
    voice: normalizeVoice(input.voice),
    format: responseFormat,
    mimeType: audioFormatToMime(responseFormat),
    audioBase64: audioBuffer.toString('base64'),
    disclosure: 'Elora voice responses are AI-generated audio.',
  };
}

function now() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(voiceDir, { recursive: true });
}

function voicePath(voiceSessionId: string) {
  return path.join(voiceDir, `${voiceSessionId}.json`);
}

function defaultApprovalPolicy(maxHighRiskActions = 0, mode: VoiceApprovalPolicy['mode'] = 'browser_session'): VoiceApprovalPolicy {
  return {
    allowHighRiskActions: maxHighRiskActions > 0,
    maxHighRiskActions,
    approvedHighRiskActions: 0,
    mode,
  };
}

function strictCallApprovalPolicy(approvalNote?: string): VoiceApprovalPolicy {
  return {
    allowHighRiskActions: false,
    maxHighRiskActions: 0,
    approvedHighRiskActions: 0,
    approvalNote,
    mode: 'phone_call',
    lockedReason: 'Phone-call sessions cannot execute write, external-send, purchase/commit, or any code tools. Escalate to text approval after the call.',
    lockedToolCategories: ['code'],
    lockedRiskLevels: ['write', 'external_send', 'purchase_or_commit', 'code_execution'],
  };
}

function escapeXml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function publicTelephonyStreamUrl() {
  const base = runtimeConfig.publicBaseUrl || `http://localhost:${runtimeConfig.port}`;
  const wsBase = base.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '');
  return `${wsBase}${runtimeConfig.telephonyStreamPath}`;
}


function publicHttpBaseUrl() {
  return (runtimeConfig.publicBaseUrl || `http://localhost:${runtimeConfig.port}`).replace(/\/$/, '');
}

function publicVoiceUrl(pathname: string, params?: Record<string, string | undefined>) {
  const url = new URL(pathname, publicHttpBaseUrl());
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
}

function isTwilioConfigured() {
  return Boolean(runtimeConfig.twilioAccountSid && runtimeConfig.twilioAuthToken && runtimeConfig.twilioFromNumber);
}

function telephonyReadiness() {
  const checks = {
    textLoop: runtimeConfig.voiceTextLoopReady,
    approvalUi: runtimeConfig.voiceApprovalUiReady,
    executionReceipts: runtimeConfig.voiceExecutionReceiptsReady,
    delegationE2E: runtimeConfig.voiceDelegationE2EReady,
  };
  const missing = Object.entries(checks)
    .filter(([, ready]) => !ready)
    .map(([name]) => name);
  return { ready: missing.length === 0, missing };
}

function telephonyNotReadyMessage(missing: string[]) {
  return `Telephony is gated until voice prerequisites pass: ${missing.join(', ')}.`;
}

function callbackApprovalRequired(message: string) {
  return {
    status: 'approval_required' as const,
    message,
    approvalPolicy: {
      required: true,
      action: 'voice.callback_missed_call',
      riskLevel: 'external_send',
      requirements: ['confirmedByUser must be true', 'approvalNote should describe the missed-call callback authorization'],
    },
  };
}

async function createTwilioOutboundCall(input: { to: string; from?: string; voiceSessionId: string }) {
  const readiness = telephonyReadiness();
  if (!readiness.ready) {
    return {
      provider: 'twilio' as const,
      status: 'not_ready' as const,
      message: telephonyNotReadyMessage(readiness.missing),
      missingPrerequisites: readiness.missing,
    };
  }

  if (!isTwilioConfigured()) {
    return {
      provider: 'twilio' as const,
      status: 'not_configured' as const,
      message: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER to place outbound calls.',
    };
  }

  const body = new URLSearchParams({
    To: input.to,
    From: input.from || runtimeConfig.twilioFromNumber,
    Url: publicVoiceUrl('/api/voice/telephony/outbound-answer', { voiceSessionId: input.voiceSessionId }),
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(runtimeConfig.twilioAccountSid)}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${runtimeConfig.twilioAccountSid}:${runtimeConfig.twilioAuthToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    return {
      provider: 'twilio' as const,
      status: 'failed' as const,
      message: data.message || `Twilio outbound call failed with status ${response.status}`,
      details: data,
    };
  }

  return {
    provider: 'twilio' as const,
    status: 'queued' as const,
    providerCallId: data.sid as string | undefined,
    details: {
      sid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from,
    },
  };
}


function meetingAdapterUrl(provider: 'zoom' | 'teams' | 'google_meet' | 'other') {
  if (provider === 'zoom') return runtimeConfig.zoomMeetingAdapterUrl;
  if (provider === 'teams') return runtimeConfig.teamsMeetingAdapterUrl;
  if (provider === 'google_meet') return runtimeConfig.googleMeetAdapterUrl;
  return '';
}

async function requestMeetingAdapterJoin(record: VoiceSessionRecord) {
  const adapterUrl = record.meeting ? meetingAdapterUrl(record.meeting.provider) : '';
  if (!adapterUrl || !record.meeting) {
    return {
      provider: record.meeting?.provider || 'other',
      status: 'not_configured' as const,
      message: 'No meeting adapter URL is configured for this provider. Store the listener session and ingest transcripts through the meeting transcript endpoint.',
    };
  }

  const response = await fetch(adapterUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voiceSessionId: record.id,
      agentSessionId: record.agentSessionId,
      provider: record.meeting.provider,
      title: record.meeting.title,
      joinUrl: record.meeting.joinUrl,
      externalMeetingId: record.meeting.externalMeetingId,
      botDisplayName: record.meeting.botDisplayName,
      transcriptWebhookUrl: publicVoiceUrl(`/api/voice/meetings/${record.id}/transcript`),
      defaultMode: 'silent_notes',
      speakingRequiresExplicitConsent: true,
    }),
  });

  const details = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    return {
      provider: record.meeting.provider,
      status: 'failed' as const,
      message: details.message || `Meeting adapter request failed with status ${response.status}`,
      details,
    };
  }

  return {
    provider: record.meeting.provider,
    status: 'join_requested' as const,
    message: details.message || 'Meeting adapter join requested.',
    details,
  };
}

function meetingSpeakingApprovalRequired() {
  return {
    status: 'approval_required' as const,
    message: 'Speaking in meetings requires explicit consent before Elora can respond out loud.',
    approvalPolicy: {
      required: true,
      action: 'voice.meeting_speak',
      riskLevel: 'external_send',
      requirements: ['confirmedByUser must be true', 'approvalNote should describe meeting participant consent'],
    },
  };
}

function decodeMuLawSample(sample: number) {
  const MULAW_BIAS = 0x84;
  sample = ~sample & 0xff;
  const sign = sample & 0x80;
  const exponent = (sample >> 4) & 0x07;
  const mantissa = sample & 0x0f;
  let pcm = ((mantissa << 3) + MULAW_BIAS) << exponent;
  pcm -= MULAW_BIAS;
  return sign ? -pcm : pcm;
}

function muLawPayloadsToWavBase64(payloads: string[], sampleRate = 8000) {
  const muLaw = Buffer.concat(payloads.map((payload) => Buffer.from(payload, 'base64')));
  const pcm = Buffer.alloc(muLaw.length * 2);
  for (let i = 0; i < muLaw.length; i += 1) {
    pcm.writeInt16LE(decodeMuLawSample(muLaw[i]), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString('base64');
}

export async function saveVoiceSession(record: VoiceSessionRecord) {
  await ensureStore();
  record.updatedAt = now();
  await fs.writeFile(voicePath(record.id), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function getVoiceSession(voiceSessionId: string) {
  await ensureStore();
  const raw = await fs.readFile(voicePath(voiceSessionId), 'utf8');
  return JSON.parse(raw) as VoiceSessionRecord;
}

export async function createInterfaceVoiceSession(input: {
  sessionId?: string;
  speaker?: string;
  maxHighRiskActions?: number;
}) {
  const createdAt = now();
  const record: VoiceSessionRecord = {
    id: randomUUID(),
    agentSessionId: input.sessionId || randomUUID(),
    direction: 'interface',
    channelKind: 'interface_voice',
    status: 'active',
    caller: input.speaker,
    createdAt,
    updatedAt: createdAt,
    approvalPolicy: defaultApprovalPolicy(input.maxHighRiskActions || 0, 'browser_session'),
    transcript: [],
  };
  return saveVoiceSession(record);
}

export async function createInboundVoiceSession(input: {
  sessionId?: string;
  caller?: string;
  callee?: string;
  providerCallId?: string;
  telephonyProvider?: 'twilio' | 'generic';
  approvalNote?: string;
}) {
  const createdAt = now();
  const record: VoiceSessionRecord = {
    id: randomUUID(),
    agentSessionId: input.sessionId || randomUUID(),
    direction: 'inbound',
    channelKind: 'phone_call',
    status: 'active',
    caller: input.caller,
    callee: input.callee,
    providerCallId: input.providerCallId,
    telephonyProvider: input.telephonyProvider || 'generic',
    mediaStream: { status: 'waiting', receivedFrames: 0, receivedBytes: 0 },
    createdAt,
    updatedAt: createdAt,
    approvalPolicy: strictCallApprovalPolicy(input.approvalNote),
    transcript: [
      {
        id: randomUUID(),
        role: 'system',
        text: 'Inbound phone call connected. High-risk tools are locked until the call is over and explicit text approval is obtained.',
        at: createdAt,
      },
    ],
  };
  return saveVoiceSession(record);
}

export async function initiateOutboundCall(input: {
  sessionId?: string;
  to: string;
  from?: string;
  objective?: string;
  confirmedByUser?: boolean;
  approvalNote?: string;
  maxHighRiskActions?: number;
}) {
  if (!input.confirmedByUser) {
    return {
      status: 'approval_required' as const,
      message: 'Outbound calls are external-send actions and require explicit user approval before initiation.',
    };
  }

  const createdAt = now();
  const record: VoiceSessionRecord = {
    id: randomUUID(),
    agentSessionId: input.sessionId || randomUUID(),
    direction: 'outbound',
    channelKind: 'phone_call',
    status: 'initiated',
    caller: input.from || runtimeConfig.twilioFromNumber || undefined,
    callee: input.to,
    objective: input.objective,
    createdAt,
    updatedAt: createdAt,
    approvalPolicy: strictCallApprovalPolicy(input.approvalNote),
    callbackApproval: {
      status: 'approved',
      approvedAt: createdAt,
      approvedBy: 'user',
      note: input.approvalNote,
    },
    mediaStream: { status: 'waiting', receivedFrames: 0, receivedBytes: 0 },
    transcript: [
      { id: randomUUID(), role: 'system', text: 'Outbound call approved. High-risk tools remain locked during the call.', at: createdAt },
      ...(input.objective
        ? [{ id: randomUUID(), role: 'system' as const, text: `Outbound call objective: ${input.objective}`, at: createdAt }]
        : []),
    ],
  };

  await saveVoiceSession(record);
  const providerResult = await createTwilioOutboundCall({ to: input.to, from: input.from, voiceSessionId: record.id });
  if (providerResult.providerCallId) {
    record.providerCallId = providerResult.providerCallId;
    record.telephonyProvider = 'twilio';
    await saveVoiceSession(record);
  }

  return {
    status: providerResult.status,
    voiceSession: record,
    provider: providerResult.provider,
    providerResult,
    message:
      providerResult.status === 'not_ready'
        ? providerResult.message
        : providerResult.status === 'not_configured'
          ? 'Outbound call approval was recorded, but no telephony adapter credentials are configured yet.'
          : 'Outbound call submitted to the telephony provider.',
  };
}



export async function recordMissedCall(input: {
  sessionId?: string;
  from: string;
  to?: string;
  callSid?: string;
  voicemailText?: string;
  occurredAt?: string;
}) {
  const sessionId = input.sessionId || runtimeConfig.missedCallSessionId;
  const missedCallId = randomUUID();
  const occurredAt = input.occurredAt || now();
  const memoryText = [
    `Missed call from ${input.from}${input.to ? ` to ${input.to}` : ''} at ${occurredAt}.`,
    input.callSid ? `Provider call id: ${input.callSid}.` : undefined,
    input.voicemailText ? `Voicemail/transcript: ${input.voicemailText}` : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const memory = await remember(sessionId, memoryText, {
    scope: 'task_history',
    tags: ['voice', 'missed-call', 'callback-needed'],
    source: 'voice',
  });
  const task = await createTask(
    sessionId,
    `Approve callback to ${input.from}`,
    JSON.stringify(
      {
        type: 'missed_call_callback',
        missedCallId,
        from: input.from,
        to: input.to,
        callSid: input.callSid,
        occurredAt,
        voicemailText: input.voicemailText,
        memoryId: memory.id,
        approvalRequired: true,
      },
      null,
      2,
    ),
  );

  return {
    missedCall: { id: missedCallId, sessionId, from: input.from, to: input.to, callSid: input.callSid, occurredAt, voicemailText: input.voicemailText },
    memory,
    task,
    approvalPolicy: callbackApprovalRequired('Missed-call callbacks require explicit approval before Elora places an outbound call.').approvalPolicy,
  };
}

export async function approveMissedCallCallback(input: {
  sessionId?: string;
  missedCallId?: string;
  taskId?: string;
  to: string;
  from?: string;
  objective?: string;
  confirmedByUser?: boolean;
  approvalNote?: string;
}) {
  if (!input.confirmedByUser) {
    return callbackApprovalRequired('Confirm the missed-call callback before Elora places the outbound call.');
  }

  const result = await initiateOutboundCall({
    sessionId: input.sessionId || runtimeConfig.missedCallSessionId,
    to: input.to,
    from: input.from,
    objective: input.objective || `Callback for missed call${input.missedCallId ? ` ${input.missedCallId}` : ''}.`,
    confirmedByUser: true,
    approvalNote: input.approvalNote || `Approved callback for missed call ${input.missedCallId || input.to}.`,
  });

  const voiceSession = result.voiceSession!;
  voiceSession.missedCallId = input.missedCallId;
  voiceSession.callbackTaskId = input.taskId;
  voiceSession.callbackApproval = {
    status: 'approved',
    approvedAt: now(),
    approvedBy: 'user',
    note: input.approvalNote,
  };
  await saveVoiceSession(voiceSession);

  if (input.taskId) {
    await updateTask(input.sessionId || runtimeConfig.missedCallSessionId, input.taskId, {
      status: result.status === 'failed' ? 'failed' : 'running',
      notes: `Callback approval processed. Voice session: ${voiceSession.id}. Provider status: ${result.status}.`,
    });
  }

  return result;
}

export function renderOutboundTelephonyTwiML(record: VoiceSessionRecord) {
  const streamUrl = publicTelephonyStreamUrl();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '<Say>Elora is returning your call. This AI call may be transcribed for memory and follow up.</Say>',
    '<Connect>',
    `<Stream url="${escapeXml(streamUrl)}">`,
    `<Parameter name="voiceSessionId" value="${escapeXml(record.id)}"/>`,
    `<Parameter name="agentSessionId" value="${escapeXml(record.agentSessionId)}"/>`,
    '</Stream>',
    '</Connect>',
    '</Response>',
  ].join('');
}

export async function createInboundTelephonyWebhook(input: {
  provider?: 'twilio' | 'generic';
  from?: string;
  to?: string;
  callSid?: string;
  accountSid?: string;
}) {
  const readiness = telephonyReadiness();
  if (!readiness.ready) {
    return {
      status: 'not_ready' as const,
      message: telephonyNotReadyMessage(readiness.missing),
      missingPrerequisites: readiness.missing,
      twiml: '<Response><Say>Elora phone voice is not enabled yet.</Say></Response>',
    };
  }

  const voiceSession = await createInboundVoiceSession({
    caller: input.from,
    callee: input.to,
    providerCallId: input.callSid,
    telephonyProvider: input.provider || 'twilio',
    approvalNote: `Inbound ${input.provider || 'twilio'} call ${input.callSid || 'unknown call id'} opened with strict call-time approval lock.`,
  });
  return {
    voiceSession,
    twiml: renderInboundTelephonyTwiML(voiceSession),
  };
}

export function renderInboundTelephonyTwiML(record: VoiceSessionRecord) {
  const streamUrl = publicTelephonyStreamUrl();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    '<Say>Elora is online. This AI call may be transcribed for memory and follow up. Please begin speaking.</Say>',
    '<Connect>',
    `<Stream url="${escapeXml(streamUrl)}">`,
    `<Parameter name="voiceSessionId" value="${escapeXml(record.id)}"/>`,
    `<Parameter name="agentSessionId" value="${escapeXml(record.agentSessionId)}"/>`,
    '</Stream>',
    '</Connect>',
    '</Response>',
  ].join('');
}

export async function startTelephonyMediaStream(input: { voiceSessionId: string; streamSid?: string; providerCallId?: string }) {
  const record = await getVoiceSession(input.voiceSessionId);
  record.streamSid = input.streamSid || record.streamSid;
  record.providerCallId = input.providerCallId || record.providerCallId;
  record.mediaStream = {
    status: 'streaming',
    startedAt: now(),
    receivedFrames: record.mediaStream?.receivedFrames || 0,
    receivedBytes: record.mediaStream?.receivedBytes || 0,
  };
  record.approvalPolicy = strictCallApprovalPolicy(record.approvalPolicy.approvalNote);
  await saveVoiceSession(record);
  return record;
}

export async function noteTelephonyMediaFrame(input: { voiceSessionId: string; payload: string; sequenceNumber?: string }) {
  const record = await getVoiceSession(input.voiceSessionId);
  const bytes = Buffer.byteLength(input.payload || '', 'base64');
  record.mediaStream = {
    status: 'streaming',
    startedAt: record.mediaStream?.startedAt || now(),
    receivedFrames: (record.mediaStream?.receivedFrames || 0) + 1,
    receivedBytes: (record.mediaStream?.receivedBytes || 0) + bytes,
    lastSequenceNumber: input.sequenceNumber || record.mediaStream?.lastSequenceNumber,
  };
  if (record.mediaStream.receivedFrames % 50 === 0) await saveVoiceSession(record);
  return record.mediaStream;
}

export async function finalizeTelephonyMediaStream(input: {
  voiceSessionId: string;
  payloads: string[];
  streamSid?: string;
  voice?: string;
}) {
  const record = await getVoiceSession(input.voiceSessionId);
  record.streamSid = input.streamSid || record.streamSid;
  record.mediaStream = {
    status: 'completed',
    startedAt: record.mediaStream?.startedAt,
    endedAt: now(),
    receivedFrames: input.payloads.length,
    receivedBytes: input.payloads.reduce((total, payload) => total + Buffer.byteLength(payload || '', 'base64'), 0),
    lastSequenceNumber: record.mediaStream?.lastSequenceNumber,
  };
  record.approvalPolicy = strictCallApprovalPolicy(record.approvalPolicy.approvalNote);
  await saveVoiceSession(record);

  if (!input.payloads.length) {
    return { status: 'empty' as const, voiceSession: record, message: 'Telephony stream ended without media frames.' };
  }

  const audioBase64 = muLawPayloadsToWavBase64(input.payloads);
  return transcribeAudio({
    voiceSessionId: record.id,
    audioBase64,
    audioMimeType: 'audio/wav',
    speaker: record.caller || 'caller',
    respond: true,
    voice: input.voice,
  });
}

export async function failTelephonyMediaStream(input: { voiceSessionId: string; error: string }) {
  const record = await getVoiceSession(input.voiceSessionId);
  record.mediaStream = {
    status: 'failed',
    startedAt: record.mediaStream?.startedAt,
    endedAt: now(),
    receivedFrames: record.mediaStream?.receivedFrames || 0,
    receivedBytes: record.mediaStream?.receivedBytes || 0,
    lastSequenceNumber: record.mediaStream?.lastSequenceNumber,
    lastError: input.error,
  };
  await saveVoiceSession(record);
  return record;
}

export async function createMeetingVoiceSession(input: {
  sessionId?: string;
  provider: 'zoom' | 'teams' | 'google_meet' | 'other';
  title?: string;
  joinUrl?: string;
  externalMeetingId?: string;
  botDisplayName?: string;
  objective?: string;
  confirmedByUser?: boolean;
  approvalNote?: string;
}) {
  if (!input.confirmedByUser) {
    return {
      status: 'approval_required' as const,
      message: 'Joining a meeting as a listener requires explicit user approval and participant-consent handling by the meeting adapter.',
    };
  }

  const createdAt = now();
  const record: VoiceSessionRecord = {
    id: randomUUID(),
    agentSessionId: input.sessionId || randomUUID(),
    direction: 'meeting',
    channelKind: 'meeting',
    status: 'initiated',
    objective: input.objective,
    createdAt,
    updatedAt: createdAt,
    approvalPolicy: {
      ...defaultApprovalPolicy(0, 'meeting'),
      approvalNote: input.approvalNote,
    },
    meeting: {
      provider: input.provider,
      title: input.title,
      joinUrl: input.joinUrl,
      externalMeetingId: input.externalMeetingId,
      botDisplayName: input.botDisplayName || 'Elora Notes',
      adapterStatus: 'not_configured',
      silentMode: true,
      speakingConsent: { status: 'not_requested' },
    },
    transcript: [
      {
        id: randomUUID(),
        role: 'system',
        text: `Meeting listener created for ${input.provider}${input.title ? `: ${input.title}` : ''}.`,
        at: createdAt,
      },
      ...(input.objective
        ? [{ id: randomUUID(), role: 'system' as const, text: `Meeting objective: ${input.objective}`, at: createdAt }]
        : []),
    ],
  };

  await saveVoiceSession(record);
  const adapterResult = await requestMeetingAdapterJoin(record);
  record.meeting!.adapterStatus = adapterResult.status === 'join_requested' ? 'join_requested' : adapterResult.status;
  record.meeting!.adapterMessage = adapterResult.message;
  await saveVoiceSession(record);
  return {
    status: adapterResult.status === 'failed' ? 'failed' as const : 'queued' as const,
    voiceSession: record,
    provider: adapterResult.provider,
    adapterResult,
    message: adapterResult.message,
  };
}


export async function approveMeetingSpeaking(input: { voiceSessionId: string; confirmedByUser?: boolean; approvalNote?: string; approvedBy?: string }) {
  if (!input.confirmedByUser) return meetingSpeakingApprovalRequired();
  const record = await getVoiceSession(input.voiceSessionId);
  if (record.direction !== 'meeting' || !record.meeting) throw new Error('voiceSessionId is not a meeting listener session');
  record.meeting.speakingConsent = {
    status: 'approved',
    approvedAt: now(),
    approvedBy: input.approvedBy || 'user',
    note: input.approvalNote,
  };
  record.meeting.silentMode = false;
  record.transcript.push({
    id: randomUUID(),
    role: 'system',
    text: `Meeting speaking consent approved: ${input.approvalNote || 'no note provided'}`,
    at: now(),
  });
  await saveVoiceSession(record);
  return { status: 'approved' as const, voiceSession: record };
}

export async function updateMeetingAdapterStatus(input: {
  voiceSessionId: string;
  status: 'listening' | 'ended' | 'failed';
  message?: string;
  externalMeetingId?: string;
}) {
  const record = await getVoiceSession(input.voiceSessionId);
  if (record.direction !== 'meeting' || !record.meeting) throw new Error('voiceSessionId is not a meeting listener session');
  record.meeting.adapterStatus = input.status;
  record.meeting.adapterMessage = input.message;
  record.meeting.externalMeetingId = input.externalMeetingId || record.meeting.externalMeetingId;
  await saveVoiceSession(record);
  return { voiceSession: record };
}

export async function ingestMeetingTranscript(input: {
  voiceSessionId: string;
  speaker?: string;
  text?: string;
  audioBase64?: string;
  audioMimeType?: string;
  language?: string;
  respond?: boolean;
  voice?: string;
}) {
  const record = await getVoiceSession(input.voiceSessionId);
  if (record.direction !== 'meeting' || !record.meeting) throw new Error('voiceSessionId is not a meeting listener session');
  const wantsResponse = Boolean(input.respond);
  if (wantsResponse && record.meeting.speakingConsent.status !== 'approved') {
    const result = await transcribeAudio({ ...input, respond: false });
    return { ...result, speaking: meetingSpeakingApprovalRequired() };
  }
  return transcribeAudio({ ...input, respond: wantsResponse });
}

export async function appendTranscript(voiceSessionId: string, entry: Omit<VoiceTranscriptEntry, 'id' | 'at'>) {
  const record = await getVoiceSession(voiceSessionId);
  const transcriptEntry = { id: randomUUID(), at: now(), ...entry };
  record.transcript.push(transcriptEntry);
  await saveVoiceSession(record);
  return { record, transcriptEntry };
}

export async function transcribeAudio(input: { voiceSessionId: string; audioId?: string; text?: string; audioBase64?: string; audioMimeType?: string; language?: string; speaker?: string; respond?: boolean; voice?: string }) {
  let text = input.text?.trim() || '';
  if (!text && input.audioBase64) {
    text = (await transcribeWithOpenAi({ audioBase64: input.audioBase64, audioMimeType: input.audioMimeType, language: input.language })) || '';
  }

  if (!text) {
    return {
      status: 'transcription_pending' as const,
      audioId: input.audioId,
      language: input.language,
      voiceProvider: getVoiceRuntimeConfig().provider,
      message: isConfiguredOpenAiVoice()
        ? 'No transcript text was produced from the supplied audio.'
        : 'No OpenAI voice provider is configured yet; set OPENAI_API_KEY or submit text to route the utterance through the agent endpoint.',
    };
  }

  const existing = await getVoiceSession(input.voiceSessionId);
  const { record } = await appendTranscript(input.voiceSessionId, {
    role: existing.direction === 'meeting' || input.speaker ? 'participant' : 'caller',
    text,
    audioId: input.audioId,
    speaker: input.speaker,
  });
  let shouldRespond = input.respond ?? record.direction !== 'meeting';
  if (record.direction === 'meeting') {
    shouldRespond = Boolean(input.respond) && record.meeting?.speakingConsent.status === 'approved';
  }

  if (!shouldRespond) {
    return {
      status: 'completed' as const,
      voiceSession: record,
      transcription: { text, language: input.language, speaker: input.speaker },
      agent: { text: '', finalOutput: undefined, runtimeEvents: [] },
      synthesis: undefined,
    };
  }

  const agentResult = await runAgentMessage({
    message: text,
    sessionId: record.agentSessionId,
    channel: 'voice',
    voiceSessionId: record.id,
    voiceApproval: record.approvalPolicy,
  });

  await saveVoiceSession(record);

  const assistantText = (agentResult.text || (agentResult.finalOutput as any)?.visibleReply || '').trim();
  if (assistantText) await appendTranscript(record.id, { role: 'agent', text: assistantText });

  const updated = await getVoiceSession(record.id);
  return {
    status: 'completed' as const,
    voiceSession: updated,
    transcription: { text, language: input.language, speaker: input.speaker },
    agent: { text: assistantText, finalOutput: agentResult.finalOutput, runtimeEvents: agentResult.runtimeEvents },
    synthesis: await synthesizeSpeech({
      voiceSession: updated,
      text: assistantText,
      voice: input.voice,
      delivery: record.channelKind === 'phone_call' ? 'call' : 'preview',
    }),
  };
}

export async function synthesizeSpeech(input: { voiceSession?: VoiceSessionRecord; text: string; voice?: string; delivery?: 'preview' | 'call' | 'stream'; responseFormat?: string }) {
  const audio = await synthesizeWithOpenAi({ text: input.text, voice: input.voice, responseFormat: input.responseFormat });
  if (audio) {
    return {
      ...audio,
      voiceSessionId: input.voiceSession?.id,
      delivery: input.delivery || 'preview',
      text: input.text,
    };
  }

  return {
    status: 'synthesis_pending' as const,
    provider: 'not_configured',
    voiceSessionId: input.voiceSession?.id,
    voice: normalizeVoice(input.voice),
    delivery: input.delivery || 'preview',
    text: input.text,
    disclosure: 'Elora voice responses are AI-generated audio when a speech provider is configured.',
    message: 'OpenAI speech synthesis is not configured yet; set OPENAI_API_KEY to render audio.',
  };
}

export async function summarizeVoiceSession(voiceSessionId: string, extractMemory = false) {
  const record = await getVoiceSession(voiceSessionId);
  const callerLines = record.transcript.filter((entry) => entry.role === 'caller' || entry.role === 'participant').map((entry) => entry.speaker ? `${entry.speaker}: ${entry.text}` : entry.text);
  const agentLines = record.transcript.filter((entry) => entry.role === 'agent').map((entry) => entry.text);
  const summary = [
    `${record.channelKind === 'meeting' ? 'Meeting listener' : 'Voice'} ${record.direction} session ${record.id} (${record.status}).`,
    record.meeting?.title ? `Meeting: ${record.meeting.title} (${record.meeting.provider}).` : undefined,
    record.objective ? `Objective: ${record.objective}.` : undefined,
    callerLines.length ? `${record.channelKind === 'meeting' ? 'Participants said' : 'Caller said'}: ${callerLines.slice(-10).join(' | ')}` : 'No transcript captured yet.',
    agentLines.length ? `Agent replied: ${agentLines.slice(-5).join(' | ')}` : 'No agent reply captured yet.',
  ]
    .filter(Boolean)
    .join('\n');

  record.summary = summary;
  await saveVoiceSession(record);

  const memory = extractMemory
    ? await remember(record.agentSessionId, summary, { scope: 'session', tags: ['voice', record.channelKind, record.channelKind === 'meeting' ? 'meeting-summary' : 'call-summary', record.direction] })
    : undefined;

  return { voiceSession: record, summary, memory };
}
