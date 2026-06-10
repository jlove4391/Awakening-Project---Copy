// authBridge/utils/googleClient.js
import { google } from 'googleapis';
import { getToken, setToken } from './tokenStore.js';

export function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const stored = getToken('google');
  if (stored) client.setCredentials(stored);
  // Auto refresh handling: googleapis updates tokens on refresh; persist them
  client.on('tokens', (tokens) => {
    const merged = { ...(getToken('google') || {}), ...tokens };
    setToken('google', merged);
  });
  return client;
}

export function getAuthUrl() {
  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.modify'
  ];
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });
}

export async function exchangeCodeForTokens(code) {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  // tokens may include: access_token, refresh_token, scope, expiry_date, token_type
  setToken('google', tokens);
  return tokens;
}
