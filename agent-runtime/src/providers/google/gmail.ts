import { Buffer } from 'node:buffer';
import { googleApiRequest, requireExplicitApproval, type ApprovalGateInput } from './auth.js';

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';

export interface SearchMessagesInput {
  query?: string;
  maxResults?: number;
}

export interface SendEmailInput extends ApprovalGateInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

interface GmailListResponse {
  messages?: Array<{ id?: string; threadId?: string }>;
}

interface GmailMessageResponse {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name?: string; value?: string }> };
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || null;
}

function encodeAddressHeader(label: string, values: string[] = []) {
  return values.length ? `${label}: ${values.join(', ')}\r\n` : '';
}

function encodeRawEmail(input: SendEmailInput) {
  const message =
    encodeAddressHeader('To', input.to) +
    encodeAddressHeader('Cc', input.cc) +
    encodeAddressHeader('Bcc', input.bcc) +
    `Subject: ${input.subject}\r\n` +
    'Content-Type: text/plain; charset="UTF-8"\r\n\r\n' +
    input.body;

  return Buffer.from(message, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function searchGmailMessages(input: SearchMessagesInput) {
  const params = new URLSearchParams({
    q: input.query || '',
    maxResults: String(input.maxResults || 10),
  });
  const listResponse = await googleApiRequest<GmailListResponse>(`${GMAIL_API_BASE}/users/me/messages?${params}`);

  const messages = await Promise.all(
    (listResponse.messages || []).map(async (message) => {
      const detailParams = new URLSearchParams({
        format: 'metadata',
        metadataHeaders: 'From',
      });
      detailParams.append('metadataHeaders', 'To');
      detailParams.append('metadataHeaders', 'Subject');
      detailParams.append('metadataHeaders', 'Date');
      const detail = await googleApiRequest<GmailMessageResponse>(`${GMAIL_API_BASE}/users/me/messages/${message.id}?${detailParams}`);
      const headers = detail.payload?.headers || [];
      return {
        id: detail.id,
        threadId: detail.threadId,
        snippet: detail.snippet,
        internalDate: detail.internalDate,
        from: headerValue(headers, 'From'),
        to: headerValue(headers, 'To'),
        subject: headerValue(headers, 'Subject'),
        date: headerValue(headers, 'Date'),
      };
    }),
  );

  return { ok: true, provider: 'gmail', messages };
}

export async function sendGmailEmail(input: SendEmailInput) {
  const approvalBlock = requireExplicitApproval(input, 'gmail.send_email');
  if (approvalBlock) return approvalBlock;

  const response = await googleApiRequest<{ id?: string; threadId?: string }>(`${GMAIL_API_BASE}/users/me/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodeRawEmail(input) }),
  });

  return { ok: true, provider: 'gmail', message: { id: response.id, threadId: response.threadId } };
}
