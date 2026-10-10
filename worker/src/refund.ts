import type { Env, EventRecord, PartyRecord, PartyRefund, RefundMethod } from './types.ts';
import { reassign } from './seating/db.ts';

/* ── Refunds (LGD-37) ──────────────────────────────────────────
 * The money goes back outside this system: Keith refunds in Square, or pays
 * the buyer back by Venmo or cash. Square's webhook only ever adds buyers, so
 * without this a refunded buyer stays on the door list, in `sold` and in
 * Sales. Staff record the refund here: the tickets come off the show, their
 * seats go back on sale, check-in goes, and the record stays behind (at
 * quantity 0 when fully refunded) because the party key is the webhook's
 * dedupe marker — a later Square event for the same payment cannot put the
 * buyer back.
 */

export class RefundError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const REFUND_METHODS: readonly RefundMethod[] = ['square', 'venmo', 'cash', 'check', 'other'];
const ALLOWED = new Set(['quantity', 'method', 'amountCents', 'note']);

export interface RefundInput {
  /** Tickets coming off the show; absent = all of them. */
  quantity?: number;
  method: RefundMethod;
  /** What went back to the buyer; absent = their share of what they paid. */
  amountCents?: number;
  note?: string;
}

export function parseRefund(body: unknown): RefundInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new RefundError(400, 'Invalid request body');
  const obj = body as Record<string, unknown>;
  for (const k of Object.keys(obj)) if (!ALLOWED.has(k)) throw new RefundError(400, `Unexpected field: ${k}`);
  if (typeof obj.method !== 'string' || !(REFUND_METHODS as readonly string[]).includes(obj.method)) {
    throw new RefundError(400, `method must be one of ${REFUND_METHODS.join(', ')}`);
  }
  const input: RefundInput = { method: obj.method as RefundMethod };
  if (obj.quantity !== undefined) {
    if (typeof obj.quantity !== 'number' || !Number.isInteger(obj.quantity) || obj.quantity < 1) {
      throw new RefundError(400, 'quantity must be a whole number of tickets');
    }
    input.quantity = obj.quantity;
  }
  if (obj.amountCents !== undefined && obj.amountCents !== null) {
    if (typeof obj.amountCents !== 'number' || !Number.isInteger(obj.amountCents) || obj.amountCents < 0) {
      throw new RefundError(400, 'amountCents must be a whole number of cents');
    }
    input.amountCents = obj.amountCents;
  }
  if (obj.note !== undefined) {
    if (typeof obj.note !== 'string' || obj.note.length > 300) throw new RefundError(400, 'note must be text (300 characters at most)');
    if (obj.note.trim()) input.note = obj.note.trim();
  }
  return input;
}

async function readEvent(env: Env, id: string): Promise<EventRecord> {
  const raw = await env.EVENTS.get(`event:${id}`);
  if (!raw) throw new RefundError(404, 'Show not found');
  try {
    return JSON.parse(raw) as EventRecord;
  } catch {
    throw new RefundError(500, 'Show is malformed');
  }
}

export interface RefundResult {
  party: PartyRecord;
  refunded: number;
  sold: number;
}

export async function recordRefund(env: Env, eventId: string, paymentId: string, input: RefundInput): Promise<RefundResult> {
  const event = await readEvent(env, eventId);
  const partyKey = `party:${eventId}:${paymentId}`;
  const party = await env.GUESTLIST.get<PartyRecord>(partyKey, 'json');
  if (!party) throw new RefundError(404, 'Party not found in show');
  if (party.quantity < 1) throw new RefundError(409, 'This party has no tickets left on this show (already refunded or transferred)');

  const n = input.quantity ?? party.quantity;
  if (n > party.quantity) throw new RefundError(400, `quantity must be from 1 to ${party.quantity}`);
  const remaining = party.quantity - n;

  // A seated party keeping some tickets must first be moved down to that many seats (Check-in → seats);
  // which seats it gives up is a staff choice, not ours. Refunding everything releases them all.
  const seats = event.seating ? (party.seats ?? []) : [];
  if (seats.length > remaining && remaining > 0) {
    throw new RefundError(409, `This party holds ${seats.length} seats; change them to ${remaining} first, then record the refund`);
  }
  if (seats.length && remaining === 0) {
    const r = await reassign(env.SEATING, eventId, partyKey, []);
    if (!r.ok) throw new RefundError(500, 'Could not release the seats');
  }

  // Keep Sales honest: what stays on the show is what was paid less what went back.
  const unit = event.tickets.find((t) => t.ticketType === party.ticketType)?.priceCents;
  const paid = party.amountCents ?? (unit !== undefined ? unit * party.quantity : undefined);
  const back = input.amountCents ?? (paid !== undefined ? Math.round((paid * n) / party.quantity) : undefined);
  const refund: PartyRefund = {
    quantity: n,
    method: input.method,
    at: new Date().toISOString(),
    ...(back !== undefined ? { amountCents: back } : {}),
    ...(input.note ? { note: input.note } : {}),
  };
  const updated: PartyRecord = {
    ...party,
    quantity: remaining,
    ...(paid !== undefined && back !== undefined ? { amountCents: Math.max(0, paid - back) } : {}),
    refunds: [...(party.refunds ?? []), refund],
  };
  if (remaining === 0) {
    delete updated.seats;
    delete updated.seatLabels;
    delete updated.seatStatus;
  }
  await env.GUESTLIST.put(partyKey, JSON.stringify(updated));
  if (remaining === 0) {
    const checkinKey = `checkin:${eventId}:${paymentId}`;
    if (await env.GUESTLIST.get(checkinKey)) await env.GUESTLIST.delete(checkinKey);
  }

  // Re-read the show so a sale that landed meanwhile is not overwritten.
  const now = await readEvent(env, eventId);
  now.sold = Math.max(0, (now.sold ?? 0) - n);
  await env.EVENTS.put(`event:${eventId}`, JSON.stringify(now));
  return { party: updated, refunded: n, sold: now.sold };
}

/** "Refunded 1 (Venmo)" — the door-list note fragment for a party that kept some tickets. */
export function refundNote(refunds: PartyRefund[] | undefined): string {
  if (!refunds?.length) return '';
  const n = refunds.reduce((s, r) => s + r.quantity, 0);
  const how = [...new Set(refunds.map((r) => (r.method === 'square' ? 'Square' : r.method[0].toUpperCase() + r.method.slice(1))))];
  return `Refunded ${n} (${how.join(', ')})`;
}
