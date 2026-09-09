/**
 * Door roster for reserved-seating shows (P4): each party carries its seats,
 * and the response carries the layout plus live occupancy for the chart.
 */
import { describe, expect, it } from 'vitest';
import { ROOM_SEATS, admin, checkout, createEvent, expireHold, hold, mockSquareCheckout, mockSquarePaid, paymentUpdated, seatedShow } from './helpers.ts';
import { deliverWebhook } from './webhook-driver.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };

describe('GET /api/admin/events/:id/guests', () => {
  it('general-admission rosters are unchanged (no seating block, no seat fields)', async () => {
    mockSquareCheckout();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 2 });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ga.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));
    const r = await admin(`/api/admin/events/${ga.id}/guests`);
    expect(r.status).toBe(200);
    expect(r.body.seating).toBeUndefined();
    expect(r.body.parties).toHaveLength(1);
    expect(r.body.parties[0]).toMatchObject({ id: 'PAY1', firstName: 'Frank', lastName: 'Sinatra', quantity: 2 });
    expect(r.body.parties[0].seats).toBeUndefined();
    expect(r.body.parties[0].seatStatus).toBeUndefined();
  });

  it('seated rosters carry seats per party and the layout + occupancy for the chart', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 3, holdId: h.body.holdId });
    mockSquarePaid({ orderId: 'ORD1', paymentId: 'PAY1', note: `legends-event:${ev.id}:Show Only:3` });
    await deliverWebhook(paymentUpdated('PAY1', 'ORD1'));
    const live = await hold(ev.id, { ticketType: 'Dinner + Show', quantity: 2 }); // someone mid-checkout
    const lapsed = await hold(ev.id, { ...SHOW_ONLY, quantity: 1 });
    await expireHold(lapsed.body.holdId);

    const r = await admin(`/api/admin/events/${ev.id}/guests`);
    expect(r.status).toBe(200);
    expect(r.body.parties[0]).toMatchObject({ id: 'PAY1', seats: ['o_2.1', 'o_2.2', 'o_2.3'], seatLabels: ['T2-1', 'T2-2', 'T2-3'], seatStatus: 'assigned' });
    expect(r.body.seating.layout.objects).toHaveLength(8);
    const seats = r.body.seating.seats as Record<string, { status: string; partyId?: string }>;
    expect(Object.keys(seats)).toHaveLength(ROOM_SEATS);
    expect(seats['o_2.1']).toEqual({ status: 'sold', partyId: 'PAY1' });
    expect(seats['o_2.3']).toEqual({ status: 'sold', partyId: 'PAY1' });
    for (const id of live.body.seatIds as string[]) expect(seats[id]).toEqual({ status: 'held' });
    for (const id of lapsed.body.seatIds as string[]) expect(seats[id]).toEqual({ status: 'available' });
    expect(Object.values(seats).filter((s) => s.status === 'available')).toHaveLength(ROOM_SEATS - 5);
  });

  it('flags a party that paid but lost its seats', async () => {
    const ev = await seatedShow();
    mockSquarePaid({ orderId: 'ORD-X', paymentId: 'PAY2', note: `legends-event:${ev.id}:Show Only:2` });
    await deliverWebhook(paymentUpdated('PAY2', 'ORD-X'));
    const r = await admin(`/api/admin/events/${ev.id}/guests`);
    expect(r.body.parties[0]).toMatchObject({ id: 'PAY2', seats: [], seatLabels: [], seatStatus: 'unassigned' });
  });
});
