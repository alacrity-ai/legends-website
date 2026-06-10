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

/**
 * Mint a checkout link for N tickets of one type and return its URL. The
 * worker prices the link `unit × quantity`, so the buyer's quantity choice is
 * honored without Square's (absent) quantity selector.
 */
export async function startCheckout(
  eventId: string,
  ticketType: string,
  quantity: number,
): Promise<string> {
  const res = await fetch(`${bookingApiUrl}/api/events/${eventId}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticketType, quantity }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not start checkout');
  }

  const data = (await res.json()) as { checkoutUrl: string };
  return data.checkoutUrl;
}
