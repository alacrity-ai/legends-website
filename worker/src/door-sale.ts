import type { Env, EventRecord, PartyRecord, RecordedSale, SalePaymentMethod } from './types.ts';
import { reassign } from './seating/db.ts';
import { SEAT_ID_RE, seatLabel } from '@seating/ids.ts';
import { upsertMailingListEntry } from './services/mailing-list.ts';

/* ── Door sales (LGD-33) ───────────────────────────────────────
 * Keith takes cash (or a check, or comps someone) in person. Nothing in
 * Square knows about it, so without this the buyer is missing from the door
 * list, their table can be sold again online, and Sales under-reports. Staff
 * record the sale here; the result is the same `party:<eventId>:<paymentId>`
 * record the webhook would have written, with `recordedSale` saying how the
 * money changed hands. Those records get a `door-…` id, and only those can be
 * voided — a Square party is always Square's to refund.
 */

export class DoorSaleError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const DOOR_ID_RE = /^door-[a-z0-9]{12}$/;
export const isDoorSale = (p: Pick<PartyRecord, 'paymentId' | 'recordedSale'>): boolean => DOOR_ID_RE.test(p.paymentId) && !!p.recordedSale;

const METHODS: readonly SalePaymentMethod[] = ['cash', 'check', 'comp', 'other'];
const MAX_QTY = 20;
const MAX_FIELD = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DoorSaleInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  quantity: number;
  ticketType: string;
  method: SalePaymentMethod;
  amountCents?: number;
  takenBy?: string;
  note?: string;
  seatIds: string[];
  sendConfirmation: boolean;
}

function str(obj: Record<string, unknown>, field: string, required: boolean): string {
  const v = obj[field];
  if (v === undefined || v === null || v === '') {
    if (required) throw new DoorSaleError(400, `${field} is required`);
    return '';
  }
  if (typeof v !== 'string') throw new DoorSaleError(400, `${field} must be a string`);
  if (v.length > MAX_FIELD) throw new DoorSaleError(400, `${field} is too long`);
  const t = v.trim();
  if (required && !t) throw new DoorSaleError(400, `${field} is required`);
  return t;
}

const ALLOWED = new Set(['firstName', 'lastName', 'email', 'phone', 'quantity', 'ticketType', 'method', 'amountCents', 'takenBy', 'note', 'seatIds', 'sendConfirmation']);

/** Shape-check a request body; the show's own rules (ticket types, seats) are applied in `recordSale`. */
export function parseDoorSale(body: unknown): DoorSaleInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new DoorSaleError(400, 'Invalid request body');
  const obj = body as Record<string, unknown>;
  for (const k of Object.keys(obj)) if (!ALLOWED.has(k)) throw new DoorSaleError(400, `Unexpected field: ${k}`);

  const firstName = str(obj, 'firstName', true);
  const lastName = str(obj, 'lastName', false);
  const email = str(obj, 'email', false);
  if (email && !EMAIL_RE.test(email)) throw new DoorSaleError(400, 'email must be an email address');
  const phone = str(obj, 'phone', false) || null;
  const ticketType = str(obj, 'ticketType', true);
  const takenBy = str(obj, 'takenBy', false) || undefined;
  const note = str(obj, 'note', false) || undefined;

  const quantity = obj.quantity;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
    throw new DoorSaleError(400, `quantity must be a whole number from 1 to ${MAX_QTY}`);
  }
  const method = obj.method;
  if (typeof method !== 'string' || !(METHODS as readonly string[]).includes(method)) {
    throw new DoorSaleError(400, `method must be one of ${METHODS.join(', ')}`);
  }
  let amountCents: number | undefined;
  if (obj.amountCents !== undefined && obj.amountCents !== null) {
    if (typeof obj.amountCents !== 'number' || !Number.isInteger(obj.amountCents) || obj.amountCents < 0) {
      throw new DoorSaleError(400, 'amountCents must be a whole number of cents');
    }
    amountCents = obj.amountCents;
  }
  const seatIds = obj.seatIds === undefined ? [] : obj.seatIds;
  if (!Array.isArray(seatIds) || seatIds.length > MAX_QTY || !seatIds.every((s) => typeof s === 'string' && SEAT_ID_RE.test(s))) {
    throw new DoorSaleError(400, 'seatIds must be a list of seat ids');
  }
  if (new Set(seatIds).size !== seatIds.length) throw new DoorSaleError(400, 'seatIds must not repeat');
  if (obj.sendConfirmation !== undefined && typeof obj.sendConfirmation !== 'boolean') {
    throw new DoorSaleError(400, 'sendConfirmation must be true or false');
  }
  if (obj.sendConfirmation === true && !email) throw new DoorSaleError(400, 'sendConfirmation needs an email address');

  return {
    firstName,
    lastName,
    email,
    phone,
    quantity,
    ticketType,
    method: method as SalePaymentMethod,
    ...(amountCents !== undefined ? { amountCents } : {}),
    ...(takenBy ? { takenBy } : {}),
    ...(note ? { note } : {}),
    seatIds: seatIds as string[],
    sendConfirmation: obj.sendConfirmation === true,
  };
}

async function readEvent(env: Env, id: string): Promise<EventRecord> {
  const raw = await env.EVENTS.get(`event:${id}`);
  if (!raw) throw new DoorSaleError(404, 'Show not found');
  try {
    return JSON.parse(raw) as EventRecord;
  } catch {
    throw new DoorSaleError(500, 'Show is malformed');
  }
}

const newDoorId = (): string => `door-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

function labelsFor(layout: NonNullable<EventRecord['seating']>['layout'], seatIds: readonly string[]): string[] {
  const byObject = new Map(layout.objects.map((o) => [o.id, o]));
  return seatIds.map((sid) => {
    const dot = sid.lastIndexOf('.');
    const o = byObject.get(sid.slice(0, dot));
    return o ? seatLabel(o, Number(sid.slice(dot + 1))) : sid;
  });
}

export interface RecordSaleResult {
  party: PartyRecord;
  event: EventRecord;
  sold: number;
  /** The show just reached capacity, so its cached checkout links must go. */
  nowSoldOut: boolean;
}

export async function recordSale(env: Env, eventId: string, input: DoorSaleInput): Promise<RecordSaleResult> {
  const event = await readEvent(env, eventId);
  if (event.cancelledAt) throw new DoorSaleError(409, 'This show has been cancelled');
  if (!event.tickets.some((t) => t.ticketType === input.ticketType)) {
    throw new DoorSaleError(400, `Unknown ticket type "${input.ticketType}"; this show sells: ${event.tickets.map((t) => t.ticketType).join(', ')}`);
  }
  if (input.seatIds.length) {
    if (!event.seating) throw new DoorSaleError(400, 'This show has no seating chart; leave seatIds out');
    const layout = event.seating.layout;
    const known = new Set(layout.objects.filter((o) => o.kind !== 'stage').flatMap((o) => Array.from({ length: o.seats }, (_, i) => `${o.id}.${i + 1}`)));
    const unknown = input.seatIds.find((s) => !known.has(s));
    if (unknown) throw new DoorSaleError(400, `Unknown seat: ${unknown}`);
    if (input.seatIds.length > input.quantity) {
      throw new DoorSaleError(400, `${input.quantity} ${input.quantity === 1 ? 'ticket' : 'tickets'}; pick at most that many seats`);
    }
  }

  const at = new Date().toISOString();
  const paymentId = newDoorId();
  const partyKey = `party:${eventId}:${paymentId}`;
  const recordedSale: RecordedSale = {
    method: input.method,
    ...(input.takenBy ? { takenBy: input.takenBy } : {}),
    ...(input.note ? { note: input.note } : {}),
    at,
  };
  const party: PartyRecord = {
    paymentId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    quantity: input.quantity,
    ticketType: input.ticketType,
    purchasedAt: at,
    ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
    recordedSale,
  };

  // Seats first: if the table is gone there is nothing to record.
  if (event.seating) {
    if (input.seatIds.length) {
      const r = await reassign(env.SEATING, eventId, partyKey, input.seatIds);
      if (!r.ok) {
        const names = labelsFor(event.seating.layout, r.unavailable);
        throw new DoorSaleError(409, `${names.length === 1 ? 'Seat' : 'Seats'} ${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} already taken — pick again.`, { unavailable: r.unavailable });
      }
    }
    party.seats = input.seatIds;
    party.seatLabels = labelsFor(event.seating.layout, input.seatIds);
    party.seatStatus = input.seatIds.length >= input.quantity ? 'assigned' : input.seatIds.length > 0 ? 'partial' : 'unassigned';
  }

  await env.GUESTLIST.put(partyKey, JSON.stringify(party));

  // Every buyer joins the mailing list; never let this break the sale.
  if (party.email) {
    try {
      await upsertMailingListEntry(env.MAILING_LIST, party.email, `${party.firstName} ${party.lastName}`.trim() || null, 'purchase');
    } catch (err) {
      console.error('[door-sale] mailing-list upsert failed', err instanceof Error ? err.message : err);
    }
  }

  // Re-read the show so a Square sale that landed meanwhile is not overwritten.
  const now = await readEvent(env, eventId);
  now.sold = (now.sold ?? 0) + input.quantity;
  const nowSoldOut = !now.soldOut && now.capacity != null && now.sold >= now.capacity;
  if (nowSoldOut) now.soldOut = true;
  await env.EVENTS.put(`event:${eventId}`, JSON.stringify(now));

  return { party, event: now, sold: now.sold, nowSoldOut };
}

export interface VoidSaleResult {
  party: PartyRecord;
  sold: number;
}

/** Remove a recorded sale: seats back on the chart, `sold` down, check-in gone. Square parties are refused. */
export async function voidSale(env: Env, eventId: string, paymentId: string): Promise<VoidSaleResult> {
  const partyKey = `party:${eventId}:${paymentId}`;
  const party = await env.GUESTLIST.get<PartyRecord>(partyKey, 'json');
  if (!party) throw new DoorSaleError(404, 'Party not found in show');
  if (!isDoorSale(party)) throw new DoorSaleError(409, 'Only a sale recorded by staff can be voided; a Square order is refunded in Square');
  if (party.transferredOut?.length) throw new DoorSaleError(409, 'This sale has been transferred; void it on the show it moved to');

  const event = await readEvent(env, eventId);
  if (event.seating && party.seats?.length) {
    const r = await reassign(env.SEATING, eventId, partyKey, []);
    if (!r.ok) throw new DoorSaleError(500, 'Could not release the seats');
  }
  await env.GUESTLIST.delete(partyKey);
  const checkinKey = `checkin:${eventId}:${paymentId}`;
  if (await env.GUESTLIST.get(checkinKey)) await env.GUESTLIST.delete(checkinKey);

  const now = await readEvent(env, eventId);
  now.sold = Math.max(0, (now.sold ?? 0) - party.quantity);
  await env.EVENTS.put(`event:${eventId}`, JSON.stringify(now));
  return { party, sold: now.sold };
}

/** "Cash (Keith)" / "Comp" — the door-list note fragment for a recorded sale. */
export function recordedSaleNote(sale: RecordedSale): string {
  const how = sale.method === 'comp' ? 'Comp' : sale.method === 'other' ? 'Paid outside Square' : sale.method[0].toUpperCase() + sale.method.slice(1);
  return sale.takenBy ? `${how} (${sale.takenBy})` : how;
}
