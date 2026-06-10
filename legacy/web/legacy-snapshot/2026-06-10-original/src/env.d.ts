// src/env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    readonly REACT_APP_AUTHBRIDGE_URL: string;
  }
}
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VSCODE_BRIDGE_URL: string;
  readonly VITE_VSCODE_BRIDGE_TOKEN: string;

  // (optional) add the others you use so TS stops complaining:
  readonly VITE_API_URL?: string;
  readonly REACT_APP_OPENAI_API_KEY?: string;
  readonly VITE_ELEVENLABS_API_KEY?: string;
  readonly VITE_ELORA_DEFAULT_VOICE_ID?: string;
  readonly VITE_SOVEREIGN_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
