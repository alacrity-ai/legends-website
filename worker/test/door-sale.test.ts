/**
 * Door sales (LGD-33): staff record a sale made outside Square (cash to
 * Keith, a check, a comp) so the buyer is on the door list, holds their
 * seats on the chart and counts in Sales; and void one they got wrong.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { admin, checkout, createEvent, eventRecord, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatStatus, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const record = (id: string, body: Record<string, unknown>) =>
  admin(`/api/admin/events/${id}/parties`, { method: 'POST', body: JSON.stringify(body) });
const voidSale = (id: string, paymentId: string) => admin(`/api/admin/events/${id}/parties/${paymentId}`, { method: 'DELETE' });
const guests = async (id: string) => (await admin(`/api/admin/events/${id}/guests`)).body;

const CAROL = { firstName: 'Carol', lastName: 'Davis', email: 'carol@example.com', phone: '+19785550100', quantity: 2, ticketType: 'Dinner + Show', method: 'cash', takenBy: 'Keith' };

describe('POST /api/admin/events/:id/parties (record a door sale)', () => {
  it('puts a cash buyer on a general-admission show: door list note, sold counter, Sales row, mailing list', async () => {
    const ev = await createEvent({ capacity: 100 });
    const r = await record(ev.id, { ...CAROL, amountCents: 11990, note: 'paid at rehearsal' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.party.id).toMatch(/^door-[a-f0-9]{12}$/);
    expect(r.body.party).toMatchObject({ firstName: 'Carol', lastName: 'Davis', quantity: 2, notes: 'Dinner + Show · Cash (Keith)' });
    expect(r.body.party.seats).toBeUndefined();
    expect(r.body.sold).toBe(2);
    expect(r.body.confirmation).toBeUndefined();

    const list = await guests(ev.id);
    expect(list.parties).toHaveLength(1);
    expect(list.parties[0].id).toBe(r.body.party.id);
    expect((await eventRecord(ev.id)).sold).toBe(2);

    const buyers = (await admin(`/api/admin/sales/shows/${ev.id}`)).body.buyers;
    expect(buyers).toHaveLength(1);
    expect(buyers[0]).toMatchObject({ paymentId: r.body.party.id, amountCents: 11990, recorded: true, paidBy: 'cash' });

    const stored = await env.GUESTLIST.get(`party:${ev.id}:${r.body.party.id}`, 'json');
    expect(stored).toMatchObject({ recordedSale: { method: 'cash', takenBy: 'Keith', note: 'paid at rehearsal' } });
    expect(await env.MAILING_LIST.get('carol@example.com', 'json')).toMatchObject({ source: 'purchase', name: 'Carol Davis' });
  });

  it('values an unpriced cash sale at the ticket price and a comp at zero', async () => {
    const ev = await createEvent();
    const cash = await record(ev.id, CAROL);
    const comp = await record(ev.id, { firstName: 'Frank', ticketType: 'Show Only', quantity: 1, method: 'comp', amountCents: 0 });
    expect(cash.status).toBe(200);
    expect(comp.status).toBe(200);
    const buyers = (await admin(`/api/admin/sales/shows/${ev.id}`)).body.buyers as any[];
    expect(buyers.find((b) => b.paymentId === cash.body.party.id)).toMatchObject({ amountCents: 11990, recorded: false, paidBy: 'cash' });
    expect(buyers.find((b) => b.paymentId === comp.body.party.id)).toMatchObject({ amountCents: 0, recorded: true, paidBy: 'comp' });
    expect(comp.body.party.notes).toBe('Show Only · Comp');
  });

  it('seats the party on a reserved-seating show; those seats are sold on the chart and to the public', async () => {
    const ev = await seatedShow();
    const r = await record(ev.id, { ...CAROL, seatIds: ['o_4.1', 'o_4.2'] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.party).toMatchObject({ seats: ['o_4.1', 'o_4.2'], seatLabels: ['T4-1', 'T4-2'], seatStatus: 'assigned' });
    const st = await seatStatus(ev.id);
    expect(st['o_4.1']).toBe('sold');
    expect(st['o_4.2']).toBe('sold');
    expect(st['o_4.3']).toBe('available');
    const list = await guests(ev.id);
    expect(list.seating.seats['o_4.1']).toEqual({ status: 'sold', partyId: r.body.party.id });
  });

  it('refuses a seat someone already holds, and a party bigger than its seats is partial', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const first = await record(ev.id, { ...CAROL, seatIds: ['o_4.1', 'o_4.2'] });
    expect(first.status).toBe(200);
    const clash = await record(ev.id, { ...CAROL, firstName: 'Sammy', seatIds: ['o_4.2', 'o_4.3'] });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/T4-2/);
    expect(clash.body.unavailable).toEqual(['o_4.2']);
    expect((await guests(ev.id)).parties).toHaveLength(1);
    expect((await eventRecord(ev.id)).sold).toBe(2);

    const partial = await record(ev.id, { ...CAROL, firstName: 'Dean', quantity: 3, seatIds: ['o_5.1'] });
    expect(partial.status).toBe(200);
    expect(partial.body.party.seatStatus).toBe('partial');
    const none = await record(ev.id, { ...CAROL, firstName: 'Joey', quantity: 1 });
    expect(none.status).toBe(200);
    expect(none.body.party).toMatchObject({ seats: [], seatStatus: 'unassigned' });
  });

  it('validates the body against the show', async () => {
    const ev = await createEvent({ capacity: 3 });
    expect((await record(ev.id, { ...CAROL, ticketType: 'VIP' })).status).toBe(400);
    expect((await record(ev.id, { ...CAROL, method: 'venmo' })).status).toBe(400);
    expect((await record(ev.id, { ...CAROL, quantity: 0 })).status).toBe(400);
    expect((await record(ev.id, { ...CAROL, email: 'not-an-email' })).status).toBe(400);
    expect((await record(ev.id, { ...CAROL, seatIds: ['o_4.1'] })).status).toBe(400); // GA show
    expect((await record(ev.id, { ...CAROL, sendConfirmation: true, email: '' })).status).toBe(400);
    expect((await record(ev.id, { ...CAROL, bogus: 1 })).status).toBe(400);
    expect((await record('00000000-0000-0000-0000-000000000000', CAROL)).status).toBe(404);
    expect((await admin(`/api/admin/events/${ev.id}/parties`, { method: 'GET' })).status).toBe(405);
    expect((await admin(`/api/admin/events/${ev.id}/parties`, { method: 'POST', body: JSON.stringify(CAROL), headers: { Authorization: 'Bearer nope' } })).status).toBe(401);

    // Reaching capacity flips sold-out, like a Square sale would.
    const r = await record(ev.id, { ...CAROL, quantity: 3 });
    expect(r.status).toBe(200);
    expect(r.body.soldOut).toBe(true);
    expect((await eventRecord(ev.id)).soldOut).toBe(true);
  });

  it('refuses a cancelled show', async () => {
    const ev = await createEvent();
    await admin(`/api/admin/events/${ev.id}`, { method: 'PATCH', body: JSON.stringify({ cancelled: true }) });
    expect((await record(ev.id, CAROL)).status).toBe(409);
  });
});

describe('DELETE /api/admin/events/:id/parties/:paymentId (void a door sale)', () => {
  it('releases the seats, drops the party and its check-in, and lowers sold', async () => {
    const ev = await seatedShow();
    const r = await record(ev.id, { ...CAROL, seatIds: ['o_4.1', 'o_4.2'] });
    const id = r.body.party.id as string;
    await admin(`/api/admin/events/${ev.id}/checkin`, { method: 'POST', body: JSON.stringify({ paymentId: id }) });
    expect((await eventRecord(ev.id)).sold).toBe(2);

    const v = await voidSale(ev.id, id);
    expect(v.status, JSON.stringify(v.body)).toBe(200);
    expect(v.body.voided.id).toBe(id);
    expect(v.body.sold).toBe(0);
    expect((await seatStatus(ev.id))['o_4.1']).toBe('available');
    expect(await env.GUESTLIST.get(`party:${ev.id}:${id}`)).toBeNull();
    expect(await env.GUESTLIST.get(`checkin:${ev.id}:${id}`)).toBeNull();
    expect((await guests(ev.id)).parties).toHaveLength(0);
    expect((await voidSale(ev.id, id)).status).toBe(404);
  });

  it('never voids a Square order', async () => {
    mockSquareCheckout();
    const ev = await createEvent();
    await checkout(ev.id, { ticketType: 'Show Only', quantity: 2 });
    mockSquarePaid({ orderId: 'ORD-D1', paymentId: 'PAYDOOR1', note: `legends-event:${ev.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAYDOOR1', 'ORD-D1'));
    const v = await voidSale(ev.id, 'PAYDOOR1');
    expect(v.status).toBe(409);
    expect((await guests(ev.id)).parties).toHaveLength(1);
    expect((await eventRecord(ev.id)).sold).toBe(2);
  });
});
