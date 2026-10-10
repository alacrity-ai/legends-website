/**
 * Refunds (LGD-37): the buyer got money back (Square, Venmo, cash), so staff
 * take those tickets off the show. Door list, sold, check-in, seats and Sales
 * all follow, and a later Square event cannot put the buyer back.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { admin, checkout, createEvent, eventRecord, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatStatus, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

async function sell(eventId: string, paymentId: string, quantity: number, amountCents?: number): Promise<void> {
  await checkout(eventId, { ticketType: 'Dinner + Show', quantity });
  mockSquarePaid({ orderId: `ORD-${paymentId}`, paymentId, note: `legends-event:${eventId}:Dinner + Show:${quantity}`, amountCents });
  await deliverWebhook(paymentUpdated(paymentId, `ORD-${paymentId}`));
}

const refund = (id: string, paymentId: string, body: Record<string, unknown>) =>
  admin(`/api/admin/events/${id}/parties/${paymentId}/refund`, { method: 'POST', body: JSON.stringify(body) });
const guests = async (id: string) => (await admin(`/api/admin/events/${id}/guests`)).body.parties as any[];

describe('POST /api/admin/events/:id/parties/:paymentId/refund', () => {
  it('a full refund takes the party off the door list, sold, check-in and Sales', async () => {
    mockSquareCheckout();
    const ev = await createEvent();
    await sell(ev.id, 'PAYREF01', 3, 19485);
    await sell(ev.id, 'PAYKEEP1', 2, 12990);
    await admin(`/api/admin/events/${ev.id}/checkin`, { method: 'POST', body: JSON.stringify({ paymentId: 'PAYREF01' }) });

    const r = await refund(ev.id, 'PAYREF01', { method: 'square', note: 'Keith refunded in Square 9/17' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ refunded: 3, remaining: 0, sold: 2 });

    expect((await guests(ev.id)).map((p) => p.id)).toEqual(['PAYKEEP1']);
    expect((await eventRecord(ev.id)).sold).toBe(2);
    expect(await env.GUESTLIST.get(`checkin:${ev.id}:PAYREF01`)).toBeNull();
    const marker: any = await env.GUESTLIST.get(`party:${ev.id}:PAYREF01`, 'json');
    expect(marker).toMatchObject({ quantity: 0, amountCents: 0 });
    expect(marker.refunds[0]).toMatchObject({ quantity: 3, method: 'square', amountCents: 19485, note: 'Keith refunded in Square 9/17' });

    const buyers = (await admin(`/api/admin/sales/shows/${ev.id}`)).body.buyers as any[];
    expect(buyers.map((b) => b.paymentId)).toEqual(['PAYKEEP1']);

    expect((await refund(ev.id, 'PAYREF01', { method: 'square' })).status).toBe(409); // nothing left to refund
  });

  it('a later Square event for the same payment does not put the buyer back', async () => {
    mockSquareCheckout();
    const ev = await createEvent();
    await sell(ev.id, 'PAYREF02', 2);
    await refund(ev.id, 'PAYREF02', { method: 'square' });
    await deliverWebhook(paymentUpdated('PAYREF02', 'ORD-PAYREF02')); // Square's payment.updated for the refund
    expect(await guests(ev.id)).toHaveLength(0);
    expect((await eventRecord(ev.id)).sold).toBe(0);
  });

  it('a partial refund keeps the rest, notes it on the door list, and keeps Sales honest', async () => {
    mockSquareCheckout();
    const ev = await createEvent();
    await sell(ev.id, 'PAYREF03', 3, 12750);
    const r = await refund(ev.id, 'PAYREF03', { method: 'venmo', quantity: 1, amountCents: 4250, note: 'Keith, by Venmo' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ refunded: 1, remaining: 2, sold: 2 });
    const [party] = await guests(ev.id);
    expect(party).toMatchObject({ id: 'PAYREF03', quantity: 2 });
    expect(party.notes).toContain('Refunded 1 (Venmo)');
    const rec: any = await env.GUESTLIST.get(`party:${ev.id}:PAYREF03`, 'json');
    expect(rec.amountCents).toBe(8500);
  });

  it('a refunded transfer comes off the show it moved to, and the history stays put if it moves again', async () => {
    mockSquareCheckout();
    const from = await createEvent();
    const to = await createEvent();
    const later = await createEvent();
    await sell(from.id, 'PAYREF04', 4, 25980);
    await admin(`/api/admin/events/${from.id}/parties/PAYREF04/transfer`, { method: 'POST', body: JSON.stringify({ toEventId: to.id }) });
    expect((await refund(to.id, 'PAYREF04', { method: 'square', quantity: 1 })).status).toBe(200);
    await admin(`/api/admin/events/${to.id}/parties/PAYREF04/transfer`, { method: 'POST', body: JSON.stringify({ toEventId: later.id }) });
    const moved: any = await env.GUESTLIST.get(`party:${later.id}:PAYREF04`, 'json');
    expect(moved.quantity).toBe(3);
    expect(moved.refunds).toBeUndefined();
    expect(await guests(to.id)).toHaveLength(0);
  });

  it('on a seated show: a full refund frees the seats; a partial one waits until the seats match', async () => {
    const ev = await seatedShow();
    const sale = await admin(`/api/admin/events/${ev.id}/parties`, {
      method: 'POST',
      body: JSON.stringify({ firstName: 'Ruth', quantity: 2, ticketType: 'Dinner + Show', method: 'cash', seatIds: ['o_4.1', 'o_4.2'] }),
    });
    const id = sale.body.party.id as string;
    const partial = await refund(ev.id, id, { method: 'cash', quantity: 1 });
    expect(partial.status).toBe(409);
    expect(partial.body.error).toContain('change them to 1 first');

    const r = await refund(ev.id, id, { method: 'cash' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await seatStatus(ev.id))['o_4.1']).toBe('available');
    expect((await seatStatus(ev.id))['o_4.2']).toBe('available');
    expect(await guests(ev.id)).toHaveLength(0);
  });

  it('validates the request', async () => {
    mockSquareCheckout();
    const ev = await createEvent();
    await sell(ev.id, 'PAYREF05', 2);
    expect((await refund(ev.id, 'PAYREF05', {})).status).toBe(400); // method required
    expect((await refund(ev.id, 'PAYREF05', { method: 'paypal' })).status).toBe(400);
    expect((await refund(ev.id, 'PAYREF05', { method: 'square', quantity: 3 })).status).toBe(400);
    expect((await refund(ev.id, 'PAYREF05', { method: 'square', quantity: 0 })).status).toBe(400);
    expect((await refund(ev.id, 'PAYREF05', { method: 'square', amountCents: -1 })).status).toBe(400);
    expect((await refund(ev.id, 'PAYREF05', { method: 'square', surprise: 1 })).status).toBe(400);
    expect((await refund(ev.id, 'NOSUCHPAY', { method: 'square' })).status).toBe(404);
    expect((await admin(`/api/admin/events/${ev.id}/parties/PAYREF05/refund`, { method: 'GET' })).status).toBe(405);
    expect((await eventRecord(ev.id)).sold).toBe(2);
  });
});
