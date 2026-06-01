import type { BookingInquiry, EventDraft, TicketConfig } from './types.ts';

const MAX_PAYLOAD_FIELDS = 8;
const MAX_FIELD_LENGTH = 5000;
const MAX_TICKETS = 10;
const MAX_PRICE_CENTS = 10_000_000; // $100,000

export function parseBookingInquiry(body: unknown): BookingInquiry {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid request body');
  }

  const obj = body as Record<string, unknown>;

  const allowedKeys = new Set(['name', 'email', 'phone', 'date', 'time', 'eventType', 'location', 'message']);
  const keys = Object.keys(obj);
  if (keys.length > MAX_PAYLOAD_FIELDS) {
    throw new Error('Too many fields');
  }
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }

  const name = requireString(obj, 'name');
  const email = requireString(obj, 'email');
  if (!email.includes('@')) {
    throw new Error('email is invalid');
  }
  const date = requireString(obj, 'date');
  const location = requireString(obj, 'location');

  const phone = optionalString(obj, 'phone');
  const time = optionalString(obj, 'time');
  const eventType = optionalString(obj, 'eventType');
  const message = optionalString(obj, 'message');

  return { name, email, date, location, phone, time, eventType, message };
}

export function parseMailingListSignup(body: unknown): { email: string; name?: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid request body');
  }

  const obj = body as Record<string, unknown>;

  const allowedKeys = new Set(['email', 'name']);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }

  const email = requireString(obj, 'email');
  if (!email.includes('@')) {
    throw new Error('email is invalid');
  }

  const name = optionalString(obj, 'name');
  return { email, name };
}

export function parseShowId(raw: string | undefined | null): string {
  if (!raw) {
    throw new Error('showId is required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('showId must be YYYY-MM-DD');
  }
  return raw;
}

export function parseCheckinPayload(body: unknown): { partyId: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid request body');
  }
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key !== 'partyId') {
      throw new Error(`Unexpected field: ${key}`);
    }
  }
  const partyId = requireString(obj, 'partyId');
  if (!/^[a-z0-9]{6,32}$/.test(partyId)) {
    throw new Error('partyId is invalid');
  }
  return { partyId };
}

export function parseEventDraft(body: unknown): EventDraft {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid request body');
  }
  const obj = body as Record<string, unknown>;

  const allowedKeys = new Set([
    'showName',
    'description',
    'venueName',
    'venueAddress',
    'startTime',
    'endTime',
    'tickets',
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }

  const showName = boundedString(obj, 'showName', 200);
  const description = boundedString(obj, 'description', MAX_FIELD_LENGTH);
  const venueName = boundedString(obj, 'venueName', 200);
  const venueAddress = boundedString(obj, 'venueAddress', 500);

  const startTime = parseIsoDateTime(obj, 'startTime');
  const endTime = parseIsoDateTime(obj, 'endTime');
  if (new Date(startTime).getTime() <= Date.now()) {
    throw new Error('startTime must be in the future');
  }
  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    throw new Error('endTime must be after startTime');
  }

  const tickets = parseTickets(obj.tickets);

  return { showName, description, venueName, venueAddress, startTime, endTime, tickets };
}

/**
 * Parse a partial event update. Only the keys present in the body are returned,
 * each validated with the same rules as create. Cross-field checks (endTime
 * after startTime) are done by the caller against the merged record. Image
 * directives are handled separately by the caller. Returns {} if no draft
 * fields are present (an image-only patch is valid).
 */
export function parseEventPatch(body: unknown): Partial<EventDraft> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid request body');
  }
  const obj = body as Record<string, unknown>;

  const allowedKeys = new Set([
    'showName',
    'description',
    'venueName',
    'venueAddress',
    'startTime',
    'endTime',
    'tickets',
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }

  const patch: Partial<EventDraft> = {};
  if ('showName' in obj) patch.showName = boundedString(obj, 'showName', 200);
  if ('description' in obj) patch.description = boundedString(obj, 'description', MAX_FIELD_LENGTH);
  if ('venueName' in obj) patch.venueName = boundedString(obj, 'venueName', 200);
  if ('venueAddress' in obj) patch.venueAddress = boundedString(obj, 'venueAddress', 500);
  if ('startTime' in obj) patch.startTime = parseIsoDateTime(obj, 'startTime');
  if ('endTime' in obj) patch.endTime = parseIsoDateTime(obj, 'endTime');
  if ('tickets' in obj) patch.tickets = parseTickets(obj.tickets);

  return patch;
}

function parseTickets(value: unknown): TicketConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('At least one ticket type is required');
  }
  if (value.length > MAX_TICKETS) {
    throw new Error(`At most ${MAX_TICKETS} ticket types are allowed`);
  }

  const seen = new Set<string>();
  return value.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`ticket ${i + 1} is invalid`);
    }
    const t = raw as Record<string, unknown>;
    for (const key of Object.keys(t)) {
      if (key !== 'ticketType' && key !== 'price' && key !== 'priceCents') {
        throw new Error(`ticket ${i + 1}: unexpected field ${key}`);
      }
    }

    const ticketType = boundedString(t, 'ticketType', 100);
    const dedupeKey = ticketType.toLowerCase();
    if (seen.has(dedupeKey)) {
      throw new Error(`Duplicate ticket type: ${ticketType}`);
    }
    seen.add(dedupeKey);

    // Accept either dollars (`price`) or integer cents (`priceCents`).
    let priceCents: number;
    if (typeof t.priceCents === 'number') {
      priceCents = Math.round(t.priceCents);
    } else if (typeof t.price === 'number') {
      priceCents = Math.round(t.price * 100);
    } else {
      throw new Error(`ticket "${ticketType}": price is required`);
    }
    if (!Number.isFinite(priceCents) || priceCents <= 0 || priceCents > MAX_PRICE_CENTS) {
      throw new Error(`ticket "${ticketType}": price is out of range`);
    }

    return { ticketType, priceCents };
  });
}

function parseIsoDateTime(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`${field} is not a valid date/time`);
  }
  return value.trim();
}

function boundedString(obj: Record<string, unknown>, field: string, maxLength: number): string {
  const value = obj[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  if (value.length > maxLength) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}

function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}
