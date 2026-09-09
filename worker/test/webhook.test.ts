/**
 * Square `payment.updated` → roster party, sold counter, seat confirmation.
 * A payment is never lost: a late payer whose seats went elsewhere still gets
 * a party, flagged for staff.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { allOf, checkout, createEvent, eventRecord, expireHold, hold, holdRow, markSold, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatRows, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };

async function party(eventId: string, paymentId: string): Promise<any> {
  return env.GUESTLIST.get(`party:${eventId}:${paymentId}`, 'json');
}

describe('signature and envelope', () => {
  it('rejects unsigned, mis-signed and malformed deliveries', async () => {
    const body = paymentUpdated('PAY1', 'ORD1');
    expect((await deliverWebhook(body, { signature: null })).status).toBe(401);
    expect((await deliverWebhook(body, { signature: 'bm9wZQ==' })).status).toBe(401);
    expect((await deliverWebhook('{', {})).status).toBe(400);
  });

  it('acknowledges but ignores events that are not completed payments', async () => {
    expect(await (await deliverWebhook(JSON.stringify({ type: 'order.created', data: {} }))).json()).toEqual({ ignored: true, type: 'order.created' });
    expect(await (await deliverWebhook(paymentUpdated('PAY1', 'ORD1', 'PENDING'))).json()).toEqual({ ignored: true, status: 'PENDING' });
    const noOrder = JSON.stringify({ type: 'payment.updated', data: { object: { payment: { id: 'PAY1', status: 'COMPLETED' } } } });
    expect(await (await deliverWebhook(noOrder)).json()).toEqual({ ignored: true, reason: 'no order_id' });
  });
});

describe('general admission purchase', () => {
  it('builds the party from the order + payment + customer and advances the sold counter once', async () => {
    mockSquareCheckout();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 2 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ga.id}:Show Only:2` });
    expect((await deliverWebhook(paymentUpdated('PAY1', 'ORD1'))).status).toBe(200);

    const p = await party(ga.id, 'PAY1');
    expect(p).toMatchObject({ paymentId: 'PAY1', firstName: 'Frank', lastName: 'Sinatra', email: 'frank@example.com', phone: '+19785550100', quantity: 2, ticketType: 'Show Only', amountCents: 7990 });
    expect(p.seats).toBeUndefined();
    expect(p.seatStatus).toBeUndefined();
    expect((await eventRecord(ga.id)).sold).toBe(2);
    expect((await env.MAILING_LIST.get('frank@example.com', 'json')) as any).toMatchObject({ name: 'Frank Sinatra', source: 'purchase' });

    // Square retries deliveries; the second one must not double count.
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));
    expect((await eventRecord(ga.id)).sold).toBe(2);
  });

  it('flips the show sold out at capacity and deactivates outstanding links', async () => {
    const sq = mockSquareCheckout();
    const ga = await createEvent({ capacity: 2 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 2 }); // PL1 / ORD1
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 }); // PL2 / ORD2 — someone else still deciding
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ga.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));
    const rec = await eventRecord(ga.id);
    expect(rec.sold).toBe(2);
    expect(rec.soldOut).toBe(true);
    expect(sq.deactivated.sort()).toEqual(['PL1', 'PL2']);
    expect((await env.EVENTS.list({ prefix: `link:${ga.id}:` })).keys).toHaveLength(0);
  });

  it('records nothing when the correlation note is missing', async () => {
    const ga = await createEvent({ capacity: 120 });
    mockSquarePaid({ orderId: 'ORDX', paymentId: 'PAYX', note: 'something else' });
    await deliverWebhook(paymentUpdated('PAYX', 'ORDX'));
    expect(await party(ga.id, 'PAYX')).toBeNull();
    expect((await eventRecord(ga.id)).sold).toBe(0);
  });
});

describe('reserved seating purchase', () => {
  it('confirms the held seats onto the party and sells them in D1', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 3, holdId: h.body.holdId });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ev.id}:Show Only:3`, amountCents: 11985 });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));

    const p = await party(ev.id, 'PAY1');
    expect(p.seats).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
    expect(p.seatLabels).toEqual(['T2-1', 'T2-2', 'T2-3']);
    expect(p.seatStatus).toBe('assigned');
    const sold = (await seatRows(ev.id)).filter((s) => s.status === 'sold');
    expect(sold.map((s) => s.seat_id)).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
    expect(sold.every((s) => s.party_key === `party:${ev.id}:PAY1` && s.hold_id === null)).toBe(true);
    expect((await holdRow(h.body.holdId))).toMatchObject({ status: 'converted', party_key: `party:${ev.id}:PAY1` });
    expect((await eventRecord(ev.id)).sold).toBe(3);
    // Sold seats are gone for the next buyer.
    const next = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect(next.body.taken.sort()).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
  });

  it('a late payer keeps whatever seats are still theirs and is flagged partial', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const a = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 }); // T2 1–3
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 3, holdId: a.body.holdId });
    await expireHold(a.body.holdId);
    const b = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 }); // takes T2 1–2 from the expired hold
    expect(b.body.seatIds).toEqual(['o_2.1', 'o_2.2']);
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ev.id}:Show Only:3` });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));

    const p = await party(ev.id, 'PAY1');
    expect(p.quantity).toBe(3);
    expect(p.seats).toEqual(['o_2.3']);
    expect(p.seatLabels).toEqual(['T2-3']);
    expect(p.seatStatus).toBe('partial');
    const status = Object.fromEntries((await seatRows(ev.id)).map((s) => [s.seat_id, s.status]));
    expect(status['o_2.3']).toBe('sold');
    expect(status['o_2.1']).toBe('held'); // still B's
    expect((await eventRecord(ev.id)).sold).toBe(3);
  });

  it('a late payer who lost every seat still gets a party, flagged unassigned', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const a = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: a.body.holdId });
    await expireHold(a.body.holdId);
    await markSold(ev.id, a.body.seatIds, `party:${ev.id}:OTHER`);
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ev.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));
    const p = await party(ev.id, 'PAY1');
    expect(p.seats).toEqual([]);
    expect(p.seatStatus).toBe('unassigned');
    expect(p.email).toBe('frank@example.com');
    expect((await eventRecord(ev.id)).sold).toBe(2);
  });

  it('a payment with no hold on record (legacy link, lost row) is kept and flagged unassigned', async () => {
    const ev = await seatedShow();
    mockSquarePaid({ orderId: 'ORD-LEGACY', paymentId: 'PAY9', note: `legends-event:${ev.id}:Show Only:1` });
    await deliverWebhook(paymentUpdated('PAY9', 'ORD-LEGACY'));
    const p = await party(ev.id, 'PAY9');
    expect(p.seatStatus).toBe('unassigned');
    expect((await eventRecord(ev.id)).sold).toBe(1);
  });

  it('sells out a seated show exactly at its seat count', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    for (const [o, n] of [['o_1', 8], ['o_3', 8], ['o_4', 8], ['o_5', 6], ['o_6', 8], ['o_r', 12]] as const) await markSold(ev.id, allOf(o, n));
    await env.EVENTS.put(`event:${ev.id}`, JSON.stringify({ ...(await eventRecord(ev.id)), sold: 50 }));
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 8 });
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 8, holdId: h.body.holdId });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ev.id}:Show Only:8` });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));
    const rec = await eventRecord(ev.id);
    expect(rec.sold).toBe(58);
    expect(rec.soldOut).toBe(true);
    expect((await hold(ev.id, { ...SHOW_ONLY, quantity: 1 })).status).toBe(409);
  });
});
