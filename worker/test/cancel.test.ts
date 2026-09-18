/**
 * Cancelling a show: staff switch it off and back on. Nothing sells while it
 * is cancelled, ticket holders stay on the list (refunds are staff's, in
 * Square), and the public site still shows the night, marked as off.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { admin, api, checkout, createEvent, eventRecord, hold, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };
const patch = (id: string, body: Record<string, unknown>) => admin(`/api/admin/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
const linkKeys = async (id: string) => (await env.EVENTS.list({ prefix: `link:${id}:` })).keys.length;

describe('PATCH /api/admin/events/:id { cancelled }', () => {
  it('cancels: stamped once, nothing sells, cached checkout links are killed, ticket holders stay', async () => {
    const square = mockSquareCheckout();
    const ev = await createEvent();
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 2 });
    mockSquarePaid({ orderId: 'ORDC1', paymentId: 'PAYCANC1', note: `legends-event:${ev.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAYCANC1', 'ORDC1'));
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 3 }); // someone else's open link
    expect(await linkKeys(ev.id)).toBeGreaterThan(0);

    const r = await patch(ev.id, { cancelled: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const at = r.body.event.cancelledAt as string;
    expect(Date.parse(at)).not.toBeNaN();
    expect(await linkKeys(ev.id)).toBe(0);
    expect(square.deactivated.length).toBeGreaterThan(0);

    const buy = await checkout(ev.id, { ...SHOW_ONLY, quantity: 1 });
    expect(buy.status).toBe(409);
    expect(buy.body.error).toMatch(/cancelled/i);

    // Cancelling again keeps the first timestamp; other edits leave the state alone.
    expect((await patch(ev.id, { cancelled: true })).body.event.cancelledAt).toBe(at);
    expect((await patch(ev.id, { showName: 'Renamed' })).body.event.cancelledAt).toBe(at);

    const guests = await admin(`/api/admin/events/${ev.id}/guests`);
    expect(guests.body.parties).toHaveLength(1);
    expect((await eventRecord(ev.id)).sold).toBe(2);
  });

  it('the public feed keeps the night, flagged cancelled', async () => {
    const ev = await createEvent();
    const before = (await api('/api/events')).body.events.find((e: any) => e.id === ev.id);
    expect(before.cancelled).toBeUndefined();
    await patch(ev.id, { cancelled: true });
    const after = (await api('/api/events')).body.events.find((e: any) => e.id === ev.id);
    expect(after).toMatchObject({ id: ev.id, cancelled: true });
  });

  it('restores: the show sells again', async () => {
    mockSquareCheckout();
    const ev = await createEvent();
    await patch(ev.id, { cancelled: true });
    const r = await patch(ev.id, { cancelled: false });
    expect(r.status).toBe(200);
    expect(r.body.event.cancelledAt).toBeUndefined();
    expect((await eventRecord(ev.id)).cancelledAt).toBeUndefined();
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 1 })).status).toBe(200);
    expect((await api('/api/events')).body.events.find((e: any) => e.id === ev.id).cancelled).toBeUndefined();
  });

  it('a cancelled seated show holds no seats', async () => {
    const ev = await seatedShow();
    await patch(ev.id, { cancelled: true });
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect(h.status).toBe(409);
    expect(h.body.error).toMatch(/cancelled/i);
  });

  it('tickets move off a cancelled show, never onto one', async () => {
    mockSquareCheckout();
    const off = await createEvent();
    const on = await createEvent();
    await checkout(off.id, { ...SHOW_ONLY, quantity: 2 });
    mockSquarePaid({ orderId: 'ORDC2', paymentId: 'PAYCANC2', note: `legends-event:${off.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAYCANC2', 'ORDC2'));
    await patch(off.id, { cancelled: true });
    const transfer = (from: string, to: string) =>
      admin(`/api/admin/events/${from}/parties/PAYCANC2/transfer`, { method: 'POST', body: JSON.stringify({ toEventId: to }) });
    expect((await transfer(off.id, on.id)).status).toBe(200);
    const back = await transfer(on.id, off.id);
    expect(back.status).toBe(409);
    expect(back.body.error).toMatch(/cancelled/i);
  });

  it('rejects a non-boolean', async () => {
    const ev = await createEvent();
    expect((await patch(ev.id, { cancelled: 'yes' })).status).toBe(400);
  });
});
