import type { CalendarEvent } from '../types/event.ts';

const bookingApiUrl = import.meta.env.VITE_BOOKING_API_URL;

export async function fetchUpcomingEvents(): Promise<CalendarEvent[]> {
  const res = await fetch(`${bookingApiUrl}/api/events`);

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to fetch events');
  }

  const data = (await res.json()) as { events: CalendarEvent[] };
  return data.events;
}
