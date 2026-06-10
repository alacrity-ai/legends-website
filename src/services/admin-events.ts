import { clearPasscode, getPasscode, UnauthorizedError } from './guestlist.ts';
import type { CheckinMap, Party } from '../types/guestlist.ts';

const apiUrl = import.meta.env.VITE_BOOKING_API_URL;

export interface TicketInput {
  ticketType: string;
  /** Price in US dollars; the worker converts to integer cents. */
  price: number;
}

export interface EventDraftInput {
  showName: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startTime: string; // ISO 8601 with offset
  endTime: string; // ISO 8601 with offset
  tickets: TicketInput[];
  capacity?: number | null;
}

export interface CreatedEvent {
  id: string;
  showName: string;
  startTime: string;
  endTime: string;
  tickets: Array<{ ticketType: string; priceCents: number }>;
}

/** Full event record as stored in KV (returned by the admin list endpoint). */
export interface ManagedEvent {
  id: string;
  showName: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startTime: string;
  endTime: string;
  imageKey: string | null;
  tickets: Array<{ ticketType: string; priceCents: number; checkoutUrl?: string }>;
  capacity: number | null;
  sold: number;
  soldOut: boolean;
  remaining: number | null;
  createdAt: string;
  source: 'form' | 'google-calendar';
}

export async function createEvent(
  draft: EventDraftInput,
  image: File,
): Promise<CreatedEvent> {
  const passcode = getPasscode();
  if (!passcode) throw new UnauthorizedError();

  const form = new FormData();
  form.append('payload', JSON.stringify(draft));
  form.append('image', image);

  // Note: do NOT set Content-Type — the browser sets the multipart boundary.
  const res = await fetch(`${apiUrl}/api/admin/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${passcode}` },
    body: form,
  });

  if (res.status === 401) {
    clearPasscode();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const data = (await res.json()) as { event: CreatedEvent };
  return data.event;
}

async function authedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const passcode = getPasscode();
  if (!passcode) throw new UnauthorizedError();

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${passcode}`);

  const res = await fetch(`${apiUrl}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearPasscode();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** All events tracked in KV, newest start time first. */
export async function listEvents(): Promise<ManagedEvent[]> {
  const data = await authedRequest<{ events: ManagedEvent[] }>('/api/admin/events');
  return data.events;
}

export async function deleteEvent(id: string): Promise<void> {
  await authedRequest<{ ok: true }>(`/api/admin/events/${id}`, { method: 'DELETE' });
}

/* ── Auto-roster door check-in (v0.3) ─────────────────────────── */

export interface EventGuests {
  parties: Party[];
  checkedIn: CheckinMap;
}

/** Auto-built roster + check-in state for one event. */
export async function getEventGuests(id: string): Promise<EventGuests> {
  return authedRequest<EventGuests>(`/api/admin/events/${id}/guests`);
}

export async function eventCheckIn(id: string, paymentId: string): Promise<string> {
  const data = await authedRequest<{ checkedInAt: string }>(`/api/admin/events/${id}/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  });
  return data.checkedInAt;
}

export async function eventUncheck(id: string, paymentId: string): Promise<void> {
  await authedRequest<{ ok: true }>(`/api/admin/events/${id}/checkin`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  });
}

/** Fields accepted by a partial event update (PATCH). All optional. */
export interface EventPatchInput {
  showName?: string;
  description?: string;
  venueName?: string;
  venueAddress?: string;
  startTime?: string;
  endTime?: string;
  tickets?: TicketInput[];
  capacity?: number | null;
  soldOut?: boolean;
  /** Base64 data URL to replace the image. */
  image?: string;
  /** Set true to remove the existing image. */
  removeImage?: boolean;
}

/** Apply a partial update to a show. */
export async function updateEvent(id: string, patch: EventPatchInput): Promise<ManagedEvent> {
  const data = await authedRequest<{ event: ManagedEvent }>(`/api/admin/events/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return data.event;
}

/** Toggle a show's manual sold-out flag. */
export function setSoldOut(id: string, soldOut: boolean): Promise<ManagedEvent> {
  return updateEvent(id, { soldOut });
}
