/**
 * Checkout (the money path). General-admission shows must mint exactly as
 * before; seated shows must carry a live hold onto the Square order.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { api, checkout, createEvent, expireHold, hold, holdRow, mockSquareCheckout, mockSquareDown, release, seatRows, seatedShow } from './helpers.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };

describe('general admission (unchanged legacy contract)', () => {
  it('mints a quick_pay link priced unit x quantity at the venue location', async () => {
    const sq = mockSquareCheckout();
    const ga = await createEvent({ capacity: 120 });
    const r = await checkout(ga.id, { ...SHOW_ONLY, quantity: 2 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ checkoutUrl: 'https://sandbox.square.link/u/PL1' });
    expect(sq.links).toHaveLength(1);
    const link = sq.links[0];
    expect(link.quick_pay.name).toMatch(/^Show Only × 2 · .* · Billerica Elks$/);
    expect(link.quick_pay.name).not.toContain('Table');
    expect(link.quick_pay.price_money).toEqual({ amount: 7990, currency: 'USD' });
    expect(link.quick_pay.location_id).toBe('L-VENUE');
    expect(link.payment_note).toBe(`legends-event:${ga.id}:Show Only:2`);
    expect(link.checkout_options.redirect_url).toBe('http://localhost:5173/?purchase=success');
    expect(link.checkout_options.custom_fields).toEqual([{ title: 'Full name (for the guest list)' }]);
    expect(sq.locations[0].location.address.postal_code).toBe('01821');
    const cached = await env.EVENTS.get(`link:${ga.id}:Show Only:2:PL1`, 'json');
    expect(cached).toEqual({ checkoutUrl: 'https://sandbox.square.link/u/PL1', squarePaymentLinkId: 'PL1', squareOrderId: 'ORD1' });
  });

  it('ignores a stray holdId and never touches D1 for a GA show', async () => {
    mockSquareCheckout();
    const ga = await createEvent({ capacity: 120 });
    const r = await checkout(ga.id, { ...SHOW_ONLY, quantity: 1, holdId: 'h_0123456789ab' });
    expect(r.status).toBe(200);
    const holds = await env.SEATING.prepare('SELECT COUNT(*) AS n FROM seat_holds').first<{ n: number }>();
    expect(holds?.n).toBe(0);
  });

  it('reuses the venue location across checkouts and falls back to the default location when the address cannot be parsed', async () => {
    const sq = mockSquareCheckout();
    const ga = await createEvent({ capacity: 120 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    expect(sq.locations).toHaveLength(1);
    const odd = await createEvent({ capacity: 120, venueAddress: 'Somewhere on Main Street' });
    const r = await checkout(odd.id, { ...SHOW_ONLY, quantity: 1 });
    expect(r.status).toBe(200);
    expect(sq.links[2].quick_pay.location_id).toBe('L-DEFAULT');
    expect(sq.locations).toHaveLength(1);
  });

  it('validates the body and refuses sold-out shows', async () => {
    mockSquareCheckout();
    const ga = await createEvent({ capacity: 2 });
    const bad = async (body: string, status: number) => {
      const r = await api(`/api/events/${ga.id}/checkout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      expect(r.status, body).toBe(status);
    };
    await bad('{', 400);
    await bad(JSON.stringify({ quantity: 1 }), 400);
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 0 }), 400);
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 21 }), 400);
    await bad(JSON.stringify({ ticketType: 'VIP', quantity: 1 }), 404);
    expect((await checkout('0000-nope', { ...SHOW_ONLY, quantity: 1 })).status).toBe(404);
    await env.EVENTS.put(`event:${ga.id}`, JSON.stringify({ ...ga, sold: 2 }));
    expect((await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 })).body).toEqual({ error: 'Sold out' });
    await env.EVENTS.put(`event:${ga.id}`, JSON.stringify({ ...ga, sold: 0, soldOut: true }));
    expect((await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 })).status).toBe(409);
  });

  it('surfaces a Square outage as 502 without recording a link', async () => {
    mockSquareDown();
    const ga = await createEvent({ capacity: 120 });
    const r = await checkout(ga.id, { ...SHOW_ONLY, quantity: 1 });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('Square: Service unavailable');
    expect((await env.EVENTS.list({ prefix: `link:${ga.id}:` })).keys).toHaveLength(0);
  });
});

describe('reserved seating', () => {
  it('requires a live hold that matches the show, ticket type and quantity', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    const other = await seatedShow();
    const first = { error: 'Please choose your seats first.' };
    const stale = { error: 'Your seats are no longer held — go back and we will find you seats again.' };
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 2 })).body).toEqual(first);
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: 'garbage' })).body).toEqual(first);
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: 'h_0123456789ab' })).body).toEqual(stale);

    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect((await checkout(other.id, { ...SHOW_ONLY, quantity: 2, holdId: h.body.holdId })).body).toEqual(stale);
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 3, holdId: h.body.holdId })).body).toEqual(stale);
    expect((await checkout(ev.id, { ticketType: 'Dinner + Show', quantity: 2, holdId: h.body.holdId })).body).toEqual(stale);

    const released = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    await release(ev.id, released.body.holdId);
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: released.body.holdId })).body).toEqual(stale);

    const expired = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    await expireHold(expired.body.holdId);
    expect((await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: expired.body.holdId })).body).toEqual(stale);
    // Nothing above minted a link.
    expect((await env.EVENTS.list({ prefix: `link:${ev.id}:` })).keys).toHaveLength(0);
  });

  it('mints the link with the seats on the receipt line and ties the Square order to the hold', async () => {
    const sq = mockSquareCheckout();
    const ev = await seatedShow();
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    const before = await holdRow(h.body.holdId);
    const r = await checkout(ev.id, { ...SHOW_ONLY, quantity: 3, holdId: h.body.holdId });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.checkoutUrl).toBe('https://sandbox.square.link/u/PL1');
    expect(sq.links[0].quick_pay.name).toMatch(/^Show Only × 3 · Table 2, seats 1–3 · .* · Billerica Elks$/);
    expect(sq.links[0].quick_pay.price_money.amount).toBe(11985);
    expect(sq.links[0].payment_note).toBe(`legends-event:${ev.id}:Show Only:3`);

    const after = await holdRow(h.body.holdId);
    expect(after.status).toBe('active');
    expect(after.square_order_id).toBe('ORD1');
    expect(after.square_link_id).toBe('PL1');
    expect(after.expires_at).toBeGreaterThanOrEqual(before.expires_at);
    const held = (await seatRows(ev.id)).filter((s) => s.status === 'held');
    expect(held).toHaveLength(3);
    expect(held.every((s) => s.hold_expires_at === after.expires_at)).toBe(true);
  });

  it('describes a split party table by table', async () => {
    const sq = mockSquareCheckout();
    const ev = await seatedShow();
    const { markSold, allOf, seatIds } = await import('./helpers.ts');
    for (const o of ['o_1', 'o_2', 'o_3', 'o_4', 'o_6']) await markSold(ev.id, seatIds(o, [1, 2, 3, 4]));
    await markSold(ev.id, seatIds('o_5', [1, 2]));
    await markSold(ev.id, allOf('o_r', 12));
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 6 });
    expect(h.body.split).toBe(true);
    const r = await checkout(ev.id, { ...SHOW_ONLY, quantity: 6, holdId: h.body.holdId });
    expect(r.status).toBe(200);
    expect(sq.links[0].quick_pay.name).toMatch(/Table 2, seats 5–8; Table \d, seats \d–\d ·/);
  });

  it('keeps the hold when Square is down so the buyer can simply try again', async () => {
    mockSquareDown();
    const ev = await seatedShow();
    const h = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    const r = await checkout(ev.id, { ...SHOW_ONLY, quantity: 2, holdId: h.body.holdId });
    expect(r.status).toBe(502);
    expect((await holdRow(h.body.holdId)).status).toBe('active');
    expect((await seatRows(ev.id)).filter((s) => s.status === 'held')).toHaveLength(2);
  });

  it("a superseded hold's Square link is deactivated when its seats are taken over", async () => {
    const sq = mockSquareCheckout();
    const ev = await seatedShow();
    const a = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    await checkout(ev.id, { ...SHOW_ONLY, quantity: 3, holdId: a.body.holdId });
    await expireHold(a.body.holdId);
    const b = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    expect(b.body.seatIds).toEqual(a.body.seatIds);
    // Deactivation runs in waitUntil; give the isolate a tick.
    await new Promise((r) => setTimeout(r, 50));
    expect(sq.deactivated).toEqual(['PL1']);
    expect((await holdRow(a.body.holdId)).status).toBe('superseded');
  });
});
