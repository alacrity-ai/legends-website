/**
 * Ticket transfer: staff move a party from one show to another (a cancelled
 * night). The roster entry, the check-in and both `sold` counters move; a
 * marker stays behind so Square can never put the buyer back.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { admin, checkout, createEvent, eventRecord, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const DINNER = { ticketType: 'Dinner + Show' };

async function sell(eventId: string, paymentId: string, quantity: number, amountCents?: number): Promise<void> {
  await checkout(eventId, { ...DINNER, quantity });
  mockSquarePaid({ orderId: `ORD-${paymentId}`, paymentId, note: `legends-event:${eventId}:Dinner + Show:${quantity}`, amountCents });
  await deliverWebhook(paymentUpdated(paymentId, `ORD-${paymentId}`));
}

const transfer = (from: string, paymentId: string, body: Record<string, unknown>) =>
  admin(`/api/admin/events/${from}/parties/${paymentId}/transfer`, { method: 'POST', body: JSON.stringify(body) });

const guests = async (id: string) => (await admin(`/api/admin/events/${id}/guests`)).body.parties as any[];

describe('POST /api/admin/events/:id/parties/:paymentId/transfer', () => {
  it('moves the whole party: door lists, sold counters, check-in, and the amount paid', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent({ tickets: [{ ticketType: 'Dinner and a Show', price: 42.5 }] });
    await sell(from.id, 'PAYMOVE1', 4, 23980);
    await sell(from.id, 'PAYSTAY1', 2, 11990);
    await admin(`/api/admin/events/${from.id}/checkin`, { method: 'POST', body: JSON.stringify({ paymentId: 'PAYMOVE1' }) });

    const r = await transfer(from.id, 'PAYMOVE1', { toEventId: to.id });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ moved: 4, remainingOnSource: 0, sourceSold: 2, targetSold: 4 });

    expect((await guests(from.id)).map((p) => p.id)).toEqual(['PAYSTAY1']);
    const arrived = await guests(to.id);
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({ id: 'PAYMOVE1', firstName: 'Frank', quantity: 4 });
    expect(arrived[0].notes).toContain('Dinner + Show · Transferred from Summer GA Show (Jun 1)');
    expect((await eventRecord(from.id)).sold).toBe(2);
    expect((await eventRecord(to.id)).sold).toBe(4);
    expect(await env.GUESTLIST.get(`checkin:${from.id}:PAYMOVE1`)).toBeNull();

    const moved: any = await env.GUESTLIST.get(`party:${to.id}:PAYMOVE1`, 'json');
    expect(moved.amountCents).toBe(23980);
    expect(moved.transferredFrom).toMatchObject({ eventId: from.id, quantity: 4 });
  });

  it('a later Square event for the same payment does not put the buyer back', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent();
    await sell(from.id, 'PAYBACK1', 3);
    await transfer(from.id, 'PAYBACK1', { toEventId: to.id });
    await deliverWebhook(paymentUpdated('PAYBACK1', 'ORD-PAYBACK1')); // e.g. a partial refund of the price difference
    expect(await guests(from.id)).toHaveLength(0);
    expect((await eventRecord(from.id)).sold).toBe(0);
    expect((await eventRecord(to.id)).sold).toBe(3);
  });

  it('moves part of a party and splits what was paid', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent();
    await sell(from.id, 'PAYPART1', 2, 12990);
    const r = await transfer(from.id, 'PAYPART1', { toEventId: to.id, quantity: 1 });
    expect(r.body).toMatchObject({ moved: 1, remainingOnSource: 1, sourceSold: 1, targetSold: 1 });
    expect((await guests(from.id))[0]).toMatchObject({ id: 'PAYPART1', quantity: 1 });
    expect((await guests(to.id))[0]).toMatchObject({ id: 'PAYPART1', quantity: 1 });
    const left: any = await env.GUESTLIST.get(`party:${from.id}:PAYPART1`, 'json');
    const moved: any = await env.GUESTLIST.get(`party:${to.id}:PAYPART1`, 'json');
    expect(left.amountCents + moved.amountCents).toBe(12990);

    // The other ticket follows later: one party of 2 on the target, none left behind.
    const again = await transfer(from.id, 'PAYPART1', { toEventId: to.id });
    expect(again.body).toMatchObject({ moved: 1, remainingOnSource: 0, targetSold: 2 });
    expect(await guests(from.id)).toHaveLength(0);
    expect((await guests(to.id))[0]).toMatchObject({ quantity: 2 });
    expect(((await env.GUESTLIST.get(`party:${to.id}:PAYPART1`, 'json')) as any).amountCents).toBe(12990);
  });

  it('an order with no recorded amount is frozen at the source show price', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent({ tickets: [{ ticketType: 'Dinner and a Show', price: 42.5 }] });
    await sell(from.id, 'PAYOLD01', 5);
    const key = `party:${from.id}:PAYOLD01`;
    const old = (await env.GUESTLIST.get(key, 'json')) as any;
    delete old.amountCents;
    await env.GUESTLIST.put(key, JSON.stringify(old)); // a pre-LGD-10 record
    await transfer(from.id, 'PAYOLD01', { toEventId: to.id });
    expect(((await env.GUESTLIST.get(`party:${to.id}:PAYOLD01`, 'json')) as any).amountCents).toBe(5995 * 5);
  });

  it('sales follow the tickets', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent();
    await sell(from.id, 'PAYSALE1', 2, 11990);
    await transfer(from.id, 'PAYSALE1', { toEventId: to.id });
    const shows = (await admin('/api/admin/sales')).body.shows as any[];
    expect(shows.find((s) => s.id === from.id)).toMatchObject({ tickets: 0, grossCents: 0 });
    expect(shows.find((s) => s.id === to.id)).toMatchObject({ tickets: 2, grossCents: 11990 });
  });

  it('refuses what it cannot do honestly', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent();
    await sell(from.id, 'PAYGUARD', 2);
    expect((await transfer(from.id, 'PAYGUARD', { toEventId: from.id })).status).toBe(400);
    expect((await transfer(from.id, 'PAYGUARD', { toEventId: to.id, quantity: 3 })).status).toBe(400);
    expect((await transfer(from.id, 'PAYGUARD', { toEventId: to.id, quantity: 0 })).status).toBe(400);
    expect((await transfer(from.id, 'PAYGUARD', {})).status).toBe(400);
    expect((await transfer(from.id, 'PAYNOBODY', { toEventId: to.id })).status).toBe(404);
    expect((await transfer(from.id, 'PAYGUARD', { toEventId: crypto.randomUUID() })).status).toBe(404);
    expect((await transfer(from.id, 'PAYGUARD', { toEventId: (await seatedShow()).id })).status).toBe(409);
    expect((await eventRecord(from.id)).sold).toBe(2);

    await transfer(from.id, 'PAYGUARD', { toEventId: to.id });
    expect((await transfer(from.id, 'PAYGUARD', { toEventId: to.id })).status).toBe(409); // already gone
    expect((await admin(`/api/admin/events/${from.id}/checkin`, { method: 'POST', body: JSON.stringify({ paymentId: 'PAYGUARD' }) })).status).toBe(404);
  });
});
