import path from 'node:path';

const runtimeRoot = path.basename(process.cwd()) === 'agent-runtime' ? process.cwd() : path.resolve(process.cwd(), 'agent-runtime');

export const runtimeConfig = {
  port: Number(process.env.AGENT_RUNTIME_PORT || process.env.PORT || 4317),
  model: process.env.ELORA_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4',
  dataDir: process.env.AGENT_RUNTIME_DATA_DIR || path.join(runtimeRoot, '.runtime-data'),
  sessionBackend: process.env.AGENT_RUNTIME_SESSION_BACKEND || 'auto',
  corsOrigin: process.env.AGENT_RUNTIME_CORS_ORIGIN || 'http://localhost:3000',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  voiceTranscriptionModel: process.env.VOICE_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  voiceSpeechModel: process.env.VOICE_SPEECH_MODEL || 'gpt-4o-mini-tts',
  voiceSpeechVoice: process.env.VOICE_SPEECH_VOICE || 'marin',
  voiceSpeechInstructions:
    process.env.VOICE_SPEECH_INSTRUCTIONS ||
    'Speak as Elora: warm, composed, regal, and clear. Disclose through the product UI that this is an AI-generated voice.',
  voiceSpeechFormat: process.env.VOICE_SPEECH_FORMAT || 'mp3',
  publicBaseUrl: process.env.AGENT_RUNTIME_PUBLIC_BASE_URL || '',
  telephonyStreamPath: process.env.VOICE_TELEPHONY_STREAM_PATH || '/api/voice/telephony/stream',
  missedCallSessionId: process.env.VOICE_MISSED_CALL_SESSION_ID || 'voice-missed-calls',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || '',
  zoomMeetingAdapterUrl: process.env.ZOOM_MEETING_ADAPTER_URL || '',
  teamsMeetingAdapterUrl: process.env.TEAMS_MEETING_ADAPTER_URL || '',
  googleMeetAdapterUrl: process.env.GOOGLE_MEET_ADAPTER_URL || '',
};
