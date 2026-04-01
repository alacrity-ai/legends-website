import type { CalendarEvent } from '../types.ts';

interface GoogleEventItem {
  summary?: string;
  status?: string;
  location?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
}

interface GoogleEventsResponse {
  items?: GoogleEventItem[];
}

export async function fetchUpcomingEvents(
  apiKey: string,
  calendarId: string,
  maxResults = 10,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    key: apiKey,
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    orderBy: 'startTime',
    singleEvents: 'true',
    eventTypes: 'default',
    fields: 'items(summary,start,location,status)',
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: 'Unknown error' } })) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `Google Calendar API returned ${res.status}`);
  }

  const data = (await res.json()) as GoogleEventsResponse;
  const items = data.items ?? [];

  return items
    .filter((item) => item.status !== 'cancelled')
    .map((item) => {
      const dateTime = item.start?.dateTime;
      const allDayDate = item.start?.date;

      let date: string;
      let time: string | null;

      if (dateTime) {
        // RFC3339: "2026-04-15T20:00:00-04:00"
        date = dateTime.slice(0, 10);
        time = dateTime.slice(11, 16);
      } else {
        // All-day: "2026-04-15"
        date = allDayDate ?? '';
        time = null;
      }

      return {
        title: item.summary ?? 'Untitled Event',
        date,
        time,
        location: item.location ?? null,
      };
    });
}
