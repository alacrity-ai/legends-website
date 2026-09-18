import type { Env, EventRecord, PartyRecord, PartyTransfer } from './types.ts';

/* ── Ticket transfer ───────────────────────────────────────────
 * Staff move a party's tickets from one show to another (a cancelled or
 * rescheduled night). No money moves — refunds or price differences are
 * settled in Square by hand. What moves is the roster entry, its check-in and
 * each show's `sold` counter, so the door list, Manage Shows and Sales all
 * agree afterwards.
 */

export class TransferError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TransferResult {
  moved: number;
  /** What is left on the source show; quantity 0 = a marker only, hidden from every list. */
  source: PartyRecord;
  target: PartyRecord;
  sourceSold: number;
  targetSold: number;
  /** The target just reached capacity, so its cached checkout links must go. */
  targetNowSoldOut: boolean;
}

/** A party whose tickets have all been moved to another show. */
export const isTransferredAway = (p: PartyRecord): boolean => p.quantity === 0 && !!p.transferredOut?.length;

async function readEvent(env: Env, id: string, which: string): Promise<EventRecord> {
  const raw = await env.EVENTS.get(`event:${id}`);
  if (!raw) throw new TransferError(404, `${which} show not found`);
  try {
    return JSON.parse(raw) as EventRecord;
  } catch {
    throw new TransferError(500, `${which} show is malformed`);
  }
}

const stamp = (e: EventRecord, quantity: number, at: string): PartyTransfer => ({
  eventId: e.id,
  showName: e.showName,
  startTime: e.startTime,
  quantity,
  at,
});

export async function transferParty(
  env: Env,
  fromId: string,
  paymentId: string,
  toId: string,
  requested: number | undefined,
): Promise<TransferResult> {
  if (fromId === toId) throw new TransferError(400, 'Source and target are the same show');
  const [from, to] = await Promise.all([readEvent(env, fromId, 'Source'), readEvent(env, toId, 'Target')]);
  // Seats live in D1 and would have to be released and re-picked; not built yet.
  if (from.seating || to.seating) {
    throw new TransferError(409, 'Transfers between reserved-seating shows are not supported yet');
  }

  const sourceKey = `party:${fromId}:${paymentId}`;
  const targetKey = `party:${toId}:${paymentId}`;
  const source = await env.GUESTLIST.get<PartyRecord>(sourceKey, 'json');
  if (!source) throw new TransferError(404, 'Party not found in source show');
  if (source.quantity < 1) throw new TransferError(409, 'This party has already been transferred');

  const moved = requested ?? source.quantity;
  if (!Number.isInteger(moved) || moved < 1 || moved > source.quantity) {
    throw new TransferError(400, `quantity must be a whole number from 1 to ${source.quantity}`);
  }

  // Freeze what was paid. The target show prices its tickets differently, so
  // an order without a recorded amount would otherwise be re-priced (or lose
  // its dollar value) once it sits under the other show.
  const unit = from.tickets.find((t) => t.ticketType === source.ticketType)?.priceCents;
  const paid = source.amountCents ?? (unit !== undefined ? unit * source.quantity : undefined);
  const movedCents = paid !== undefined ? Math.round((paid * moved) / source.quantity) : undefined;

  const at = new Date().toISOString();
  const existing = await env.GUESTLIST.get<PartyRecord>(targetKey, 'json');
  // The target record starts clean: no outbound history, and no confirmation sent for this show yet.
  const carried: PartyRecord = { ...source };
  delete carried.transferredOut;
  delete carried.confirmationSentAt;
  const target: PartyRecord = {
    ...carried,
    quantity: (existing?.quantity ?? 0) + moved,
    ...(movedCents !== undefined || existing?.amountCents !== undefined
      ? { amountCents: (existing?.amountCents ?? 0) + (movedCents ?? 0) }
      : {}),
    transferredFrom: stamp(from, (existing?.transferredFrom?.quantity ?? 0) + moved, at),
    ...(existing?.confirmationSentAt ? { confirmationSentAt: existing.confirmationSentAt } : {}),
  };
  const remaining: PartyRecord = {
    ...source,
    quantity: source.quantity - moved,
    ...(paid !== undefined ? { amountCents: paid - (movedCents ?? 0) } : {}),
    transferredOut: [...(source.transferredOut ?? []), stamp(to, moved, at)],
  };

  // Target first: if anything fails midway the buyer is on both lists, never on neither.
  await env.GUESTLIST.put(targetKey, JSON.stringify(target));
  await env.GUESTLIST.put(sourceKey, JSON.stringify(remaining));
  if (remaining.quantity === 0) {
    const checkinKey = `checkin:${fromId}:${paymentId}`;
    if (await env.GUESTLIST.get(checkinKey)) await env.GUESTLIST.delete(checkinKey);
  }

  // Re-read both shows so a sale that landed meanwhile is not overwritten.
  const [fromNow, toNow] = await Promise.all([readEvent(env, fromId, 'Source'), readEvent(env, toId, 'Target')]);
  fromNow.sold = Math.max(0, (fromNow.sold ?? 0) - moved);
  toNow.sold = (toNow.sold ?? 0) + moved;
  const targetNowSoldOut = !toNow.soldOut && toNow.capacity != null && toNow.sold >= toNow.capacity;
  if (targetNowSoldOut) toNow.soldOut = true;
  await env.EVENTS.put(`event:${toId}`, JSON.stringify(toNow));
  await env.EVENTS.put(`event:${fromId}`, JSON.stringify(fromNow));

  return { moved, source: remaining, target, sourceSold: fromNow.sold, targetSold: toNow.sold, targetNowSoldOut };
}
