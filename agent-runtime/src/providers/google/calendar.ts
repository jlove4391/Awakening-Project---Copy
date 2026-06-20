import { decidePolicy } from '../../governance/policyDecision.js';
import { googleApiRequest, requirePolicyApproval, type ApprovalGateInput } from './auth.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export interface ListEventsInput {
  calendarId?: string;
  timeMin: string;
  timeMax: string;
  maxResults?: number;
}

export interface CreateEventInput extends ApprovalGateInput {
  calendarId?: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
}

interface CalendarEventsResponse {
  items?: Array<Record<string, any>>;
}

export async function listCalendarEvents(input: ListEventsInput) {
  const calendarId = encodeURIComponent(input.calendarId || 'primary');
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    maxResults: String(input.maxResults || 10),
    singleEvents: 'true',
    orderBy: 'startTime',
  });
  const response = await googleApiRequest<CalendarEventsResponse>(`${CALENDAR_API_BASE}/calendars/${calendarId}/events?${params}`);

  return {
    ok: true,
    provider: 'google-calendar',
    events: (response.items || []).map((event) => ({
      id: event.id,
      status: event.status,
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      htmlLink: event.htmlLink,
      attendees: event.attendees?.map((attendee: Record<string, any>) => ({
        email: attendee.email,
        displayName: attendee.displayName,
        responseStatus: attendee.responseStatus,
      })),
    })),
  };
}

export function classifyCalendarEventPolicy(input: CreateEventInput) {
  return decidePolicy({
    category: 'calendar',
    action: 'create_event',
    riskLevel: 'write',
    input: {
      calendarId: input.calendarId,
      summary: input.summary,
      description: input.description,
      start: input.start,
      end: input.end,
      attendees: input.attendees || [],
    },
  });
}

export async function createCalendarEvent(input: CreateEventInput) {
  const policyDecision = classifyCalendarEventPolicy(input);
  const approvalBlock = requirePolicyApproval(input, 'calendar.create_event', policyDecision);
  if (approvalBlock) return approvalBlock;

  const calendarId = encodeURIComponent(input.calendarId || 'primary');
  const response = await googleApiRequest<Record<string, any>>(`${CALENDAR_API_BASE}/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description || undefined,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: (input.attendees || []).map((email) => ({ email })),
    }),
  });

  return {
    ok: true,
    provider: 'google-calendar',
    event: {
      id: response.id,
      status: response.status,
      summary: response.summary,
      start: response.start,
      end: response.end,
      htmlLink: response.htmlLink,
    },
  };
}
