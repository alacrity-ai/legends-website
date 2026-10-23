/**
 * Door check-in: a whole party at once (the original behaviour) or some of a
 * party as they arrive (`count` = how many are here in total).
 */
import { describe, expect, it } from 'vitest';
import { admin, checkout, createEvent, mockSquareCheckout, mockSquarePaid, paymentUpdated } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };

async function showWithParty(quantity: number): Promise<string> {
  mockSquareCheckout();
  const ev = await createEvent({ capacity: 120 });
  await checkout(ev.id, { ...SHOW_ONLY, quantity });
  mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAYCHK01', note: `legends-event:${ev.id}:Show Only:${quantity}` });
  await deliverWebhook(paymentUpdated('PAYCHK01', 'ORD1'));
  return ev.id;
}

const checkin = (id: string, body: Record<string, unknown>) =>
  admin(`/api/admin/events/${id}/checkin`, { method: 'POST', body: JSON.stringify(body) });
const guests = (id: string) => admin(`/api/admin/events/${id}/guests`);

describe('door check-in', () => {
  it('without a count, checks in the whole party (what older admin builds send)', async () => {
    const id = await showWithParty(3);
    const r = await checkin(id, { paymentId: 'PAYCHK01' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, count: 3 });
    const g = await guests(id);
    expect(g.body.checkedIn.PAYCHK01).toBe(r.body.checkedInAt);
    expect(g.body.arrived).toEqual({ PAYCHK01: 3 });
  });

  it('checks in part of a party, then the rest, keeping the first arrival time', async () => {
    const id = await showWithParty(3);
    const first = await checkin(id, { paymentId: 'PAYCHK01', count: 1 });
    expect(first.status).toBe(200);
    expect(first.body.count).toBe(1);
    expect((await guests(id)).body.arrived).toEqual({ PAYCHK01: 1 });

    const rest = await checkin(id, { paymentId: 'PAYCHK01', count: 3 });
    expect(rest.body).toMatchObject({ count: 3, checkedInAt: first.body.checkedInAt });
    expect((await guests(id)).body.arrived).toEqual({ PAYCHK01: 3 });

    // Correcting a miscount down is allowed too.
    expect((await checkin(id, { paymentId: 'PAYCHK01', count: 2 })).body.count).toBe(2);
    expect((await guests(id)).body.arrived).toEqual({ PAYCHK01: 2 });
  });

  it('refuses more people than the party has tickets, and bad counts', async () => {
    const id = await showWithParty(2);
    const over = await checkin(id, { paymentId: 'PAYCHK01', count: 3 });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('This party has only 2 tickets');
    for (const count of [0, -1, 1.5, '2', null]) {
      expect((await checkin(id, { paymentId: 'PAYCHK01', count })).status).toBe(400);
    }
    expect((await checkin(id, { paymentId: 'PAYCHK01', count: 1, extra: true })).status).toBe(400);
    expect((await guests(id)).body.arrived).toEqual({});
  });

  it('undo clears a partial check-in', async () => {
    const id = await showWithParty(4);
    await checkin(id, { paymentId: 'PAYCHK01', count: 2 });
    const undo = await admin(`/api/admin/events/${id}/checkin`, { method: 'DELETE', body: JSON.stringify({ paymentId: 'PAYCHK01' }) });
    expect(undo.status).toBe(200);
    const g = await guests(id);
    expect(g.body.checkedIn).toEqual({});
    expect(g.body.arrived).toEqual({});
  });

  it('a party that shrank after check-in never shows more arrivals than tickets', async () => {
    const id = await showWithParty(3);
    await checkin(id, { paymentId: 'PAYCHK01' });
    const refund = await admin(`/api/admin/events/${id}/parties/PAYCHK01/refund`, {
      method: 'POST',
      body: JSON.stringify({ quantity: 1, method: 'square' }),
    });
    expect(refund.status, JSON.stringify(refund.body)).toBe(200);
    expect((await guests(id)).body.arrived).toEqual({ PAYCHK01: 2 });
  });
});
