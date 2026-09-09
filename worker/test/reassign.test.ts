/**
 * Staff give a party its seats (P5): assign an unassigned party, top up a
 * partial one, move a party, and lose gracefully when a seat was just taken.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { admin, checkout, createEvent, eventRecord, hold, markSold, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatRows, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };
const put = (eventId: string, paymentId: string, seatIds: unknown) =>
  admin(`/api/admin/events/${eventId}/parties/${paymentId}/seats`, { method: 'PUT', body: JSON.stringify({ seatIds }) });

/** A paid party with no seats (its hold never existed). */
async function unassignedParty(eventId: string, paymentId: string, qty: number): Promise<void> {
  mockSquarePaid({ orderId: `ORD-${paymentId}`, paymentId, note: `legends-event:${eventId}:Show Only:${qty}` });
  await deliverWebhook(paymentUpdated(paymentId, `ORD-${paymentId}`));
}

async function soldTo(showId: string): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const r of await seatRows(showId)) if (r.status === 'sold') out[r.seat_id] = r.party_key;
  return out;
}

describe('PUT /api/admin/events/:id/parties/:paymentId/seats', () => {
  it('assigns seats to a party that paid without any', async () => {
    const ev = await seatedShow();
    await unassignedParty(ev.id, 'PAY-ALPHA', 2);
    const r = await put(ev.id, 'PAY-ALPHA', ['o_3.4', 'o_3.5']);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.party).toMatchObject({ id: 'PAY-ALPHA', seats: ['o_3.4', 'o_3.5'], seatLabels: ['T3-4', 'T3-5'], seatStatus: 'assigned' });
    expect(await soldTo(ev.id)).toEqual({ 'o_3.4': `party:${ev.id}:PAY-ALPHA`, 'o_3.5': `party:${ev.id}:PAY-ALPHA` });
    const stored = (await env.GUESTLIST.get(`party:${ev.id}:PAY-ALPHA`, 'json')) as { seatStatus: string; seatLabels: string[] };
    expect(stored.seatStatus).toBe('assigned');
    expect(stored.seatLabels).toEqual(['T3-4', 'T3-5']);
    const roster = await admin(`/api/admin/events/${ev.id}/guests`);
    expect(roster.body.seating.seats['o_3.4']).toEqual({ status: 'sold', partyId: 'PAY-ALPHA' });
  });

  it('tops up a partial party and marks fewer-than-tickets as partial', async () => {
    const ev = await seatedShow();
    await unassignedParty(ev.id, 'PAY-BRAVO', 3);
    const one = await put(ev.id, 'PAY-BRAVO', ['o_1.1']);
    expect(one.body.party.seatStatus).toBe('partial');
    const three = await put(ev.id, 'PAY-BRAVO', ['o_1.1', 'o_1.2', 'o_1.3']);
    expect(three.status).toBe(200);
    expect(three.body.party.seatStatus).toBe('assigned');
    expect(Object.keys(await soldTo(ev.id)).sort()).toEqual(['o_1.1', 'o_1.2', 'o_1.3']);
  });

  it('moves a party that bought seats normally, freeing the old ones', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 }); // T2 1–2
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: h.body.holdId });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY-CHARLIE', note: `legends-event:${ev.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAY-CHARLIE', 'ORD1'));
    const r = await put(ev.id, 'PAY-CHARLIE', ['o_6.7', 'o_6.8']);
    expect(r.status).toBe(200);
    expect(r.body.party.seatLabels).toEqual(['T6-7', 'T6-8']);
    expect(Object.keys(await soldTo(ev.id)).sort()).toEqual(['o_6.7', 'o_6.8']);
    // Freed seats are immediately sellable again.
    const next = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect(next.body.seatIds).toEqual(['o_2.1', 'o_2.2']);
  });

  it('keeps the old seats and names the lost ones when a seat was just taken', async () => {
    const ev = await seatedShow();
    await unassignedParty(ev.id, 'PAY-DELTA', 2);
    await put(ev.id, 'PAY-DELTA', ['o_4.1', 'o_4.2']);
    await markSold(ev.id, ['o_5.2'], `party:${ev.id}:OTHER`);
    const live = await hold(ev.id, { ...SHOW_ONLY, quantity: 1, objectId: 'o_5' }); // someone mid-checkout at T5 (seat 1)
    expect(live.body.seatIds).toEqual(['o_5.1']);
    const r = await put(ev.id, 'PAY-DELTA', ['o_5.3', 'o_5.2']);
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Seat T5-2 was just taken — pick again.', unavailable: ['o_5.2'] });
    const sold = await soldTo(ev.id);
    expect(sold['o_4.1']).toBe(`party:${ev.id}:PAY-DELTA`);
    expect(sold['o_4.2']).toBe(`party:${ev.id}:PAY-DELTA`);
    expect(sold['o_5.3']).toBeUndefined();
    expect(sold['o_5.2']).toBe(`party:${ev.id}:OTHER`);
    const both = await put(ev.id, 'PAY-DELTA', ['o_5.1', 'o_5.2']);
    expect(both.body).toEqual({ error: 'Seats T5-1, T5-2 were just taken — pick again.', unavailable: ['o_5.1', 'o_5.2'] });
    const held = (await seatRows(ev.id)).filter((s) => s.status === 'held').map((s) => s.seat_id);
    expect(held).toEqual(live.body.seatIds); // the live hold was never touched
    const stored = (await env.GUESTLIST.get(`party:${ev.id}:PAY-DELTA`, 'json')) as { seats: string[] };
    expect(stored.seats).toEqual(['o_4.1', 'o_4.2']);
  });

  it('can take over seats of an expired hold, and releases everything with []', async () => {
    const ev = await seatedShow();
    await unassignedParty(ev.id, 'PAY-ECHO', 2);
    const stale = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    const { expireHold } = await import('./helpers.ts');
    await expireHold(stale.body.holdId);
    const r = await put(ev.id, 'PAY-ECHO', stale.body.seatIds);
    expect(r.status).toBe(200);
    const none = await put(ev.id, 'PAY-ECHO', []);
    expect(none.status).toBe(200);
    expect(none.body.party.seatStatus).toBe('unassigned');
    expect(await soldTo(ev.id)).toEqual({});
  });

  it('validates the request and the party', async () => {
    const ev = await seatedShow();
    await unassignedParty(ev.id, 'PAY-FOX', 2);
    expect((await put(ev.id, 'PAY-FOX', 'o_1.1')).status).toBe(400);
    expect((await put(ev.id, 'PAY-FOX', ['nope'])).status).toBe(400);
    expect((await put(ev.id, 'PAY-FOX', ['o_1.1', 'o_1.1'])).status).toBe(400);
    expect((await put(ev.id, 'PAY-FOX', ['o_9.1'])).body.error).toBe('Unknown seat: o_9.1');
    expect((await put(ev.id, 'PAY-FOX', ['o_1.1', 'o_1.2', 'o_1.3'])).body.error).toBe('This party has 2 tickets; pick at most that many seats');
    expect((await put(ev.id, 'PAY-NOPE', ['o_1.1'])).status).toBe(404);
    const ga = await createEvent({ capacity: 10 });
    expect((await put(ga.id, 'PAY-FOX', ['o_1.1'])).status).toBe(404);
    expect((await admin(`/api/admin/events/${ev.id}/parties/PAY-FOX/seats`, { method: 'POST', body: '{}' })).status).toBe(405);
    expect((await eventRecord(ev.id)).sold).toBe(2); // untouched
    expect(await soldTo(ev.id)).toEqual({});
  });
});
