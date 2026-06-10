import path from 'node:path';

const runtimeRoot = path.resolve(process.cwd(), 'agent-runtime');

export const runtimeConfig = {
  port: Number(process.env.AGENT_RUNTIME_PORT || process.env.PORT || 4317),
  model: process.env.ELORA_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4',
  dataDir: process.env.AGENT_RUNTIME_DATA_DIR || path.join(runtimeRoot, '.runtime-data'),
  sessionBackend: process.env.AGENT_RUNTIME_SESSION_BACKEND || 'auto',
  corsOrigin: process.env.AGENT_RUNTIME_CORS_ORIGIN || 'http://localhost:3000',
  codeWorkspaceRoot: path.resolve(process.env.NEXORA_WORKSPACE_ROOT || process.env.AGENT_RUNTIME_WORKSPACE_ROOT || process.cwd()),
  codeCommandTimeoutMs: Number(process.env.NEXORA_CODE_COMMAND_TIMEOUT_MS || 120_000),
};
