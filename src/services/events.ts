import type { CalendarEvent } from '../types/event.ts';
import type { SeatingChart, ChartObject } from '@seating/types.ts';

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
  holdId?: string,
): Promise<string> {
  const res = await fetch(`${bookingApiUrl}/api/events/${eventId}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // GA shows send exactly the body they always have; seated shows add the hold.
    body: JSON.stringify(holdId ? { ticketType, quantity, holdId } : { ticketType, quantity }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not start checkout');
  }

  const data = (await res.json()) as { checkoutUrl: string };
  return data.checkoutUrl;
}

/* ── Reserved seating (v0.5) ──────────────────────────────────── */

export interface SeatingTable {
  objectId: string;
  label: string;
  /** "Table 3" / "Row A" */
  name: string;
  kind: ChartObject['kind'];
  free: number;
  /** Can seat the requested quantity side by side. */
  fits: boolean;
  /** Distance from the stage, canvas units (list is sorted by it). */
  distance: number;
}

export interface SeatingInfo {
  layout: SeatingChart;
  seats: Record<string, 'available' | 'taken'>;
  tables: SeatingTable[];
  quantity: number;
}

export interface HeldSeats {
  holdId: string;
  expiresAt: number;
  seatIds: string[];
  seatLabels: string[];
  objects: { id: string; label: string; kind: ChartObject['kind']; seats: number[] }[];
  split: boolean;
  message: string;
  layout: SeatingChart;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? fallback;
}

/** Layout, availability and which tables can seat `quantity` together. Never cached. */
export async function fetchSeating(eventId: string, quantity: number): Promise<SeatingInfo> {
  const res = await fetch(`${bookingApiUrl}/api/events/${eventId}/seating?quantity=${quantity}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await readError(res, 'Could not load the seating chart'));
  return (await res.json()) as SeatingInfo;
}

/**
 * Ask the worker to choose and hold seats for the party. `objectId` moves the
 * party to that table; `replaceHoldId` lets go of the previous hold first.
 */
export async function holdSeats(
  eventId: string,
  body: { ticketType: string; quantity: number; objectId?: string; replaceHoldId?: string },
): Promise<HeldSeats> {
  const res = await fetch(`${bookingApiUrl}/api/events/${eventId}/seats/hold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not hold seats'));
  return (await res.json()) as HeldSeats;
}

/** Best-effort release (used when the sheet closes; survives page unload). */
export function releaseHold(eventId: string, holdId: string): void {
  void fetch(`${bookingApiUrl}/api/events/${eventId}/seats/hold/${holdId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
}
