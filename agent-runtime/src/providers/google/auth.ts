import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { runtimeConfig } from '../../config.js';
import { policyRequiresApproval, type PolicyDecision } from '../../governance/policyDecision.js';

const TOKEN_STORE_PATH = process.env.GOOGLE_TOKEN_STORE_PATH || path.join(runtimeConfig.dataDir, 'google-tokens.enc.json');
const TOKEN_SERVICE_KEY = 'google';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_WINDOW_MS = 60_000;

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

export interface ApprovalGateInput {
  confirmedByUser?: boolean;
  approvalNote?: string;
}

export interface GoogleTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
  expires_in?: number;
}

type GoogleTokenStore = Record<string, GoogleTokens | undefined>;

function keyFromEnv() {
  const raw = (process.env.GOOGLE_TOKEN_STORE_KEY || process.env.MASTER_KEY || '').trim();
  if (raw.length < 32) {
    throw new Error('GOOGLE_TOKEN_STORE_KEY or MASTER_KEY must be at least 32 characters to store Google OAuth tokens.');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptJson(value: unknown) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, keyFromEnv(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptJson<T>(payload: string): T {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, keyFromEnv(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

function ensureStoreDirectory() {
  fs.mkdirSync(path.dirname(TOKEN_STORE_PATH), { recursive: true, mode: 0o700 });
}

function loadAllTokens(): GoogleTokenStore {
  if (!fs.existsSync(TOKEN_STORE_PATH)) return {};
  const payload = fs.readFileSync(TOKEN_STORE_PATH, 'utf8').trim();
  if (!payload) return {};
  return decryptJson<GoogleTokenStore>(payload);
}

function saveAllTokens(tokens: GoogleTokenStore) {
  ensureStoreDirectory();
  fs.writeFileSync(TOKEN_STORE_PATH, encryptJson(tokens), { encoding: 'utf8', mode: 0o600 });
}

export function getStoredGoogleTokens() {
  return loadAllTokens()[TOKEN_SERVICE_KEY] || null;
}

export function setStoredGoogleTokens(tokens: GoogleTokens) {
  const allTokens = loadAllTokens();
  allTokens[TOKEN_SERVICE_KEY] = tokens;
  saveAllTokens(allTokens);
}

export function clearStoredGoogleTokens() {
  const allTokens = loadAllTokens();
  delete allTokens[TOKEN_SERVICE_KEY];
  saveAllTokens(allTokens);
}

function assertGoogleOAuthConfigured() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    throw new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.');
  }
}

function normalizeTokenExpiry(tokens: GoogleTokens) {
  return {
    ...tokens,
    expiry_date: tokens.expiry_date || (tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined),
  };
}

async function postTokenRequest(params: Record<string, string>) {
  assertGoogleOAuthConfigured();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = (await response.json()) as GoogleTokens & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Google token request failed with ${response.status}`);
  }
  return normalizeTokenExpiry(data);
}

async function refreshGoogleTokens(tokens: GoogleTokens) {
  if (!tokens.refresh_token) return tokens;
  const refreshed = await postTokenRequest({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  const merged = { ...tokens, ...refreshed, refresh_token: refreshed.refresh_token || tokens.refresh_token };
  setStoredGoogleTokens(merged);
  return merged;
}

export async function getGoogleAccessToken() {
  const tokens = getStoredGoogleTokens();
  if (!tokens?.access_token) {
    throw new Error('Google account is not connected. Visit /api/auth/google/start to authorize the runtime.');
  }
  if (tokens.expiry_date && tokens.expiry_date - Date.now() < REFRESH_WINDOW_MS) {
    const refreshed = await refreshGoogleTokens(tokens);
    if (refreshed.access_token) return refreshed.access_token;
  }
  return tokens.access_token;
}

export async function googleApiRequest<T>(url: string, init: RequestInit = {}) {
  const accessToken = await getGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const data = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string }; error_description?: string };
  if (!response.ok) {
    const message = data.error_description || data.error?.message || `Google API request failed with ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export function buildGoogleAuthUrl() {
  assertGoogleOAuthConfigured();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: GOOGLE_SCOPES.join(' '),
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const tokens = await postTokenRequest({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    grant_type: 'authorization_code',
    code,
  });
  setStoredGoogleTokens(tokens);
  return tokens;
}

export function googleAuthStatus() {
  const tokens = getStoredGoogleTokens();
  if (!tokens) return { linked: false };
  return {
    linked: true,
    scope: tokens.scope || null,
    expiry_date: tokens.expiry_date || null,
    token_type: tokens.token_type || null,
  };
}


export function requirePolicyApproval(input: ApprovalGateInput, action: string, decision: PolicyDecision) {
  if (!policyRequiresApproval(decision)) return null;
  if (input.confirmedByUser === true) return null;
  return {
    ok: false,
    status: 'approval_required',
    action,
    policy: {
      action: decision.action,
      classification: decision.policyClassification,
      reason: decision.reason,
      trustDomain: decision.trustDomain,
      ...(decision.action === 'ask_before_execution' ? { boundary: decision.boundary } : {}),
    },
    message: 'This Google action crosses an explicit approval boundary and is blocked until confirmedByUser is true.',
  };
}

export function requireExplicitApproval(input: ApprovalGateInput, action: string) {
  if (input.confirmedByUser !== true) {
    return {
      ok: false,
      status: 'approval_required',
      action,
      message: 'This Google write/send action is blocked until the user explicitly approves it and confirmedByUser is true.',
    };
  }
  return null;
}


function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] || character;
  });
}

function oauthPopupHtml(ok: boolean, message: string) {
  const payload = JSON.stringify({ type: 'elora.google_oauth_complete', ok, error: ok ? undefined : message });
  const targetOrigin = JSON.stringify(runtimeConfig.corsOrigin);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Google connection ${ok ? 'complete' : 'failed'}</title>
    <style>
      body { background: #0e0c0b; color: #e7cfa5; font-family: system-ui, sans-serif; padding: 2rem; }
      strong { color: #d1aa64; }
    </style>
  </head>
  <body>
    <p><strong>${ok ? 'Google connected.' : 'Google connection failed.'}</strong></p>
    <p>${escapeHtml(message)}</p>
    <p>You may close this window and return to Elora.</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${payload}, ${targetOrigin});
        window.close();
      }
    </script>
  </body>
</html>`;
}

export const googleAuthRouter = Router();

googleAuthRouter.get('/start', (_req, res, next) => {
  try {
    res.json({ ok: true, url: buildGoogleAuthUrl() });
  } catch (error) {
    next(error);
  }
});

googleAuthRouter.get('/callback', async (req, res, next) => {
  try {
    const { code, error } = req.query;
    if (error) {
      const message = String(error);
      res.status(400).type('html').send(oauthPopupHtml(false, message));
      return;
    }
    if (typeof code !== 'string' || !code) {
      res.status(400).type('html').send(oauthPopupHtml(false, 'Missing Google OAuth code.'));
      return;
    }

    const tokens = await exchangeGoogleCode(code);
    if (req.accepts('html')) {
      res.type('html').send(oauthPopupHtml(true, 'Google authorization finished. Elora can now refresh connection status.'));
      return;
    }

    res.json({
      ok: true,
      service: 'google',
      tokens: {
        scope: tokens.scope || null,
        expiry_date: tokens.expiry_date || null,
        token_type: tokens.token_type || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

googleAuthRouter.get('/status', (_req, res, next) => {
  try {
    res.json({ ok: true, google: googleAuthStatus() });
  } catch (error) {
    next(error);
  }
});

googleAuthRouter.delete('/tokens', (_req, res, next) => {
  try {
    clearStoredGoogleTokens();
    res.json({ ok: true, google: { linked: false } });
  } catch (error) {
    next(error);
  }
});
