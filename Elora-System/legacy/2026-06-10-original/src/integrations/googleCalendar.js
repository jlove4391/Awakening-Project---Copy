// /src/integrations/googleCalendar.js

const BACKEND_URL = 'http://localhost:4000';

export async function fetchCalendarEvents() {
  try {
    const res = await fetch(`${BACKEND_URL}/google/calendar/events`);
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch calendar events:', err);
    return [];
  }
}

export async function createCalendarEvent(eventObj) {
  try {
    const res = await fetch(`${BACKEND_URL}/google/calendar/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventObj)
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to create event:', err);
    return { error: true };
  }
}
