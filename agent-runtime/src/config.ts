import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(runtimeRoot, '..');

export const runtimeConfig = {
  port: Number(process.env.AGENT_RUNTIME_PORT || process.env.PORT || 4317),
  model: process.env.ELORA_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  dataDir: process.env.AGENT_RUNTIME_DATA_DIR || path.join(runtimeRoot, '.runtime-data'),
  sessionBackend: process.env.AGENT_RUNTIME_SESSION_BACKEND || 'auto',
  corsOrigin: process.env.AGENT_RUNTIME_CORS_ORIGIN || 'http://localhost:3000',
  codeWorkspaceRoot: process.env.NEXORA_WORKSPACE_ROOT || process.env.CODE_WORKSPACE_ROOT || repoRoot,
  codeCommandTimeoutMs: Number(process.env.NEXORA_CODE_COMMAND_TIMEOUT_MS || process.env.CODE_COMMAND_TIMEOUT_MS || 120000),

  publicBaseUrl: process.env.AGENT_RUNTIME_PUBLIC_BASE_URL || '',
  voiceTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || process.env.VOICE_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
  voiceSpeechModel: process.env.OPENAI_SPEECH_MODEL || process.env.VOICE_SPEECH_MODEL || 'gpt-4o-mini-tts',
  voiceSpeechVoice: process.env.OPENAI_SPEECH_VOICE || process.env.VOICE_SPEECH_VOICE || 'marin',
  voiceSpeechFormat: process.env.OPENAI_SPEECH_FORMAT || process.env.VOICE_SPEECH_FORMAT || 'mp3',
  voiceSpeechInstructions:
    process.env.OPENAI_SPEECH_INSTRUCTIONS ||
    process.env.VOICE_SPEECH_INSTRUCTIONS ||
    'Speak as Elora: composed, clear, concise, and operationally transparent.',
  telephonyStreamPath: process.env.AGENT_RUNTIME_TELEPHONY_STREAM_PATH || '/api/voice/telephony/stream',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
  missedCallSessionId: process.env.MISSED_CALL_SESSION_ID || 'missed-calls',
  zoomMeetingAdapterUrl: process.env.ZOOM_MEETING_ADAPTER_URL || '',
  teamsMeetingAdapterUrl: process.env.TEAMS_MEETING_ADAPTER_URL || '',
  googleMeetAdapterUrl: process.env.GOOGLE_MEET_ADAPTER_URL || '',

};
