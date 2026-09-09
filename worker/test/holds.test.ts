/**
 * Buyer-facing seat holds (P3): availability, choosing + holding seats for a
 * party, changing table, release, expiry and the two-buyers-one-seat race.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  ROOM_SEATS,
  allOf,
  api,
  createEvent,
  eventRecord,
  expireHold,
  hold,
  holdRow,
  markSold,
  release,
  seatIds,
  seatRows,
  seatStatus,
  seatedShow,
  seating,
} from './helpers.ts';

const SHOW_ONLY = { ticketType: 'Show Only' };

describe('GET /api/events/:id/seating', () => {
  it('is 404 for general-admission shows and unknown ids', async () => {
    const ga = await createEvent({ capacity: 120 });
    expect((await seating(ga.id, 2)).status).toBe(404);
    expect((await seating('0000-does-not-exist', 2)).status).toBe(404);
  });

  it('returns the layout, every seat available, and tables nearest the stage first', async () => {
    const ev = await seatedShow();
    const r = await seating(ev.id, 7);
    expect(r.status).toBe(200);
    expect(r.body.layout.objects).toHaveLength(8);
    expect(Object.keys(r.body.seats)).toHaveLength(ROOM_SEATS);
    expect(Object.values(r.body.seats).every((s) => s === 'available')).toBe(true);
    expect(r.body.quantity).toBe(7);
    const labels = r.body.tables.map((t: { label: string }) => t.label);
    expect(labels[0]).toBe('T2'); // dead centre in front of the stage
    expect(labels.slice(1, 3).sort()).toEqual(['T1', 'T3']);
    const t5 = r.body.tables.find((t: { label: string }) => t.label === 'T5');
    expect(t5.fits).toBe(false); // 6 seats cannot take 7
    expect(t5.name).toBe('Table 5');
    expect(r.body.tables.find((t: { label: string }) => t.label === 'A').name).toBe('Row A');
    expect(r.body.tables.filter((t: { fits: boolean }) => t.fits).map((t: { label: string }) => t.label).sort()).toEqual(['A', 'T1', 'T2', 'T3', 'T4', 'T6']);
  });

  it('falls back to quantity 1 when the query is out of range', async () => {
    const ev = await seatedShow();
    expect((await seating(ev.id, 99)).body.quantity).toBe(1);
  });
});

describe('POST /api/events/:id/seats/hold - validation', () => {
  it('rejects malformed bodies without touching seat state', async () => {
    const ev = await seatedShow();
    const bad = async (body: string, expectStatus = 400) => {
      const r = await api(`/api/events/${ev.id}/seats/hold`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      expect(r.status, body).toBe(expectStatus);
    };
    await bad('not json');
    await bad(JSON.stringify({ quantity: 2 }));
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 0 }));
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 21 }));
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 1.5 }));
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 2, objectId: 'T2' }));
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 2, replaceHoldId: 'nope' }));
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 2, seatIds: ['o_2.1'] })); // buyers never name seats
    await bad(JSON.stringify({ ticketType: 'VIP', quantity: 2 }), 404);
    await bad(JSON.stringify({ ...SHOW_ONLY, quantity: 2, objectId: 'o_zz' }), 404);
    expect(Object.values(await seatStatus(ev.id)).every((s) => s === 'available')).toBe(true);
    const holds = await env.SEATING.prepare('SELECT COUNT(*) AS n FROM seat_holds').first<{ n: number }>();
    expect(holds?.n).toBe(0);
  });

  it('is 404 for a general-admission show', async () => {
    const ga = await createEvent({ capacity: 120 });
    expect((await hold(ga.id, { ...SHOW_ONLY, quantity: 2 })).status).toBe(404);
  });

  it('is 409 when the show is flagged sold out or already over', async () => {
    const ev = await seatedShow();
    await env.EVENTS.put(`event:${ev.id}`, JSON.stringify({ ...ev, soldOut: true }));
    expect((await hold(ev.id, { ...SHOW_ONLY, quantity: 2 })).status).toBe(409);
    // The API refuses past dates, so age the show in KV (what the clock does on the night).
    const past = await seatedShow();
    await env.EVENTS.put(`event:${past.id}`, JSON.stringify({ ...(await eventRecord(past.id)), startTime: '2020-01-01T20:00:00-05:00', endTime: '2020-01-01T23:00:00-05:00' }));
    expect((await hold(past.id, { ...SHOW_ONLY, quantity: 2 })).status).toBe(409);
  });
});

describe('POST /api/events/:id/seats/hold - choosing and holding', () => {
  it('seats the first party together at the table nearest the stage and holds those seats', async () => {
    const ev = await seatedShow();
    const before = Date.now();
    const r = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.holdId).toMatch(/^h_[a-f0-9]{12}$/);
    expect(r.body.seatIds).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
    expect(r.body.seatLabels).toEqual(['T2-1', 'T2-2', 'T2-3']);
    expect(r.body.objects).toEqual([{ id: 'o_2', label: 'T2', kind: 'round', seats: [1, 2, 3] }]);
    expect(r.body.split).toBe(false);
    expect(r.body.message).toBe("We've saved seats for your party together at Table 2.");
    expect(r.body.taken).toEqual([]);
    expect(r.body.layout.objects).toHaveLength(8);
    expect(r.body.expiresAt).toBeGreaterThanOrEqual(before + 12 * 60 * 1000);

    const rows = (await seatRows(ev.id)).filter((s) => s.status !== 'available');
    expect(rows.map((s) => s.seat_id)).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
    expect(rows.every((s) => s.status === 'held' && s.hold_id === r.body.holdId && s.hold_expires_at === r.body.expiresAt)).toBe(true);
    const h = await holdRow(r.body.holdId);
    expect(h.status).toBe('active');
    expect(h.show_id).toBe(ev.id);
    expect(h.quantity).toBe(3);
    expect(h.ticket_type).toBe('Show Only');
    expect(JSON.parse(h.seat_ids)).toEqual(r.body.seatIds);
  });

  it('tells the next party which seats are already taken and never overlaps them', async () => {
    const ev = await seatedShow();
    const a = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    const b = await hold(ev.id, { ticketType: 'Dinner + Show', quantity: 2 });
    expect(b.status).toBe(200);
    expect(b.body.taken.sort()).toEqual(['o_2.1', 'o_2.2', 'o_2.3']);
    expect(b.body.seatIds.some((s: string) => a.body.seatIds.includes(s))).toBe(false);
    expect(b.body.objects[0].id).toBe('o_2'); // still room at the front table
    const a2 = await seating(ev.id, 2);
    expect([...a.body.seatIds, ...b.body.seatIds].every((s) => a2.body.seats[s] === 'taken')).toBe(true);
  });

  it('honours a chosen table, and refuses one that cannot seat the party together', async () => {
    const ev = await seatedShow();
    const r = await hold(ev.id, { ...SHOW_ONLY, quantity: 4, objectId: 'o_6' });
    expect(r.status).toBe(200);
    expect(r.body.objects.map((o: { label: string }) => o.label)).toEqual(['T6']);
    const no = await hold(ev.id, { ...SHOW_ONLY, quantity: 7, objectId: 'o_5' });
    expect(no.status).toBe(409);
    expect(no.body.error).toBe("Table 5 can't seat a party of 7 together — pick another table.");
    // No orphaned hold or seat from the refused request.
    expect((await seatRows(ev.id)).filter((s) => s.status === 'held')).toHaveLength(4);
  });

  it('changes table by replacing the previous hold, freeing its seats', async () => {
    const ev = await seatedShow();
    const first = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    const moved = await hold(ev.id, { ...SHOW_ONLY, quantity: 2, objectId: 'o_4', replaceHoldId: first.body.holdId });
    expect(moved.status).toBe(200);
    expect(moved.body.objects[0].id).toBe('o_4');
    expect((await holdRow(first.body.holdId)).status).toBe('released');
    const status = await seatStatus(ev.id);
    expect(first.body.seatIds.every((s: string) => status[s] === 'available')).toBe(true);
    expect(moved.body.seatIds.every((s: string) => status[s] === 'held')).toBe(true);
    expect(moved.body.taken).toEqual([]);
  });

  it('splits a party across the nearest tables only when no single table can take it', async () => {
    const ev = await seatedShow();
    // Leave 4 free at every table (seats 5–8), row A fully sold → a party of 6 must split.
    for (const o of ['o_1', 'o_2', 'o_3', 'o_4', 'o_6']) await markSold(ev.id, seatIds(o, [1, 2, 3, 4]));
    await markSold(ev.id, seatIds('o_5', [1, 2]));
    await markSold(ev.id, allOf('o_r', 12));
    const r = await hold(ev.id, { ...SHOW_ONLY, quantity: 6 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.split).toBe(true);
    expect(r.body.objects).toHaveLength(2);
    expect(r.body.objects[0].id).toBe('o_2'); // front and centre first
    expect(r.body.seatIds).toHaveLength(6);
    expect(r.body.message).toMatch(/^We've saved seats for your party at Table 2 and Table \d, right beside each other\.$/);
    expect(r.body.taken).toHaveLength(4 * 5 + 2 + 12);
  });

  it('refuses a party the room cannot seat, naming how many seats are left', async () => {
    const ev = await seatedShow();
    // Only T2 seats 7–8 and row seat 12 remain (3 seats).
    for (const [o, n] of [['o_1', 8], ['o_3', 8], ['o_4', 8], ['o_5', 6], ['o_6', 8]] as const) await markSold(ev.id, allOf(o, n));
    await markSold(ev.id, seatIds('o_2', [1, 2, 3, 4, 5, 6]));
    await markSold(ev.id, seatIds('o_r', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    const five = await hold(ev.id, { ...SHOW_ONLY, quantity: 5 });
    expect(five.status).toBe(409);
    expect(five.body).toEqual({ error: 'Only 3 seats are left for this show — try 3 or fewer tickets.', seatsLeft: 3 });
    // A pair still gets the two together at the front, not the lone row seat.
    const two = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect(two.status).toBe(200);
    expect(two.body.seatIds).toEqual(['o_2.7', 'o_2.8']);
    const one = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect(one.status).toBe(409);
    expect(one.body).toEqual({ error: 'Only 1 seat is left for this show — try 1 ticket.', seatsLeft: 1 });
    const last = await hold(ev.id, { ...SHOW_ONLY, quantity: 1 });
    expect(last.status).toBe(200);
    expect(last.body.seatIds).toEqual(['o_r.12']);
    const none = await hold(ev.id, { ...SHOW_ONLY, quantity: 1 });
    expect(none.status).toBe(409);
    expect(none.body).toEqual({ error: 'This show has just sold out.', seatsLeft: 0 });
  });

  it('seats a party in a row when every table is full', async () => {
    const ev = await seatedShow();
    for (const [o, n] of [['o_1', 8], ['o_2', 8], ['o_3', 8], ['o_4', 8], ['o_5', 6], ['o_6', 8]] as const) await markSold(ev.id, allOf(o, n));
    await markSold(ev.id, seatIds('o_r', [1, 2, 3]));
    const r = await hold(ev.id, { ...SHOW_ONLY, quantity: 4 });
    expect(r.status).toBe(200);
    expect(r.body.seatIds).toEqual(['o_r.4', 'o_r.5', 'o_r.6', 'o_r.7']);
    expect(r.body.seatLabels).toEqual(['A4', 'A5', 'A6', 'A7']);
    expect(r.body.message).toBe("We've saved seats for your party together at Row A.");
  });
});

describe('DELETE /api/events/:id/seats/hold/:holdId', () => {
  it('releases the seats and is idempotent', async () => {
    const ev = await seatedShow();
    const r = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    expect((await release(ev.id, r.body.holdId)).status).toBe(200);
    expect(Object.values(await seatStatus(ev.id)).every((s) => s === 'available')).toBe(true);
    expect((await holdRow(r.body.holdId)).status).toBe('released');
    expect((await release(ev.id, r.body.holdId)).status).toBe(200);
  });

  it("cannot release another show's hold, and rejects malformed ids", async () => {
    const a = await seatedShow();
    const b = await seatedShow();
    const r = await hold(a.id, { ...SHOW_ONLY, quantity: 2 });
    expect((await release(b.id, r.body.holdId)).status).toBe(200); // answers ok, does nothing
    expect((await holdRow(r.body.holdId)).status).toBe('active');
    expect((await seatStatus(a.id))['o_2.1']).toBe('held');
    expect((await release(a.id, 'h_zz')).status).toBe(404);
  });
});

describe('hold expiry', () => {
  it('frees expired seats for the next party and marks the old hold superseded', async () => {
    const ev = await seatedShow();
    const a = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    await expireHold(a.body.holdId);
    expect((await seating(ev.id, 1)).body.seats['o_2.1']).toBe('available');
    const b = await hold(ev.id, { ...SHOW_ONLY, quantity: 3 });
    expect(b.status).toBe(200);
    expect(b.body.seatIds).toEqual(a.body.seatIds); // same front seats, now B's
    expect((await holdRow(a.body.holdId)).status).toBe('superseded');
    const rows = (await seatRows(ev.id)).filter((s) => s.status === 'held');
    expect(rows.every((s) => s.hold_id === b.body.holdId)).toBe(true);
  });

  it('an expired hold cannot be released back over the new owner', async () => {
    const ev = await seatedShow();
    const a = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    await expireHold(a.body.holdId);
    const b = await hold(ev.id, { ...SHOW_ONLY, quantity: 2 });
    await release(ev.id, a.body.holdId);
    const status = await seatStatus(ev.id);
    expect(b.body.seatIds.every((s: string) => status[s] === 'held')).toBe(true);
  });
});

describe('two buyers, one seat', () => {
  it('20 parties race for the last 4 seats: exactly one wins, nobody is double-booked', async () => {
    const ev = await seatedShow();
    for (const [o, n] of [['o_1', 8], ['o_3', 8], ['o_4', 8], ['o_5', 6], ['o_6', 8], ['o_r', 12]] as const) await markSold(ev.id, allOf(o, n));
    await markSold(ev.id, seatIds('o_2', [1, 2, 3, 4]));
    const results = await Promise.all(Array.from({ length: 20 }, () => hold(ev.id, { ...SHOW_ONLY, quantity: 4 })));
    const won = results.filter((r) => r.status === 200);
    const lost = results.filter((r) => r.status === 409);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);
    const held = (await seatRows(ev.id)).filter((s) => s.status === 'held');
    expect(held.map((s) => s.seat_id)).toEqual(['o_2.5', 'o_2.6', 'o_2.7', 'o_2.8']);
    expect(held.every((s) => s.hold_id === won[0].body.holdId)).toBe(true);
    const active = await env.SEATING.prepare(`SELECT COUNT(*) AS n FROM seat_holds WHERE show_id=? AND status='active'`).bind(ev.id).first<{ n: number }>();
    expect(active?.n).toBe(1);
  });

  it('12 parties of 2 arriving at once all get distinct seats', async () => {
    const ev = await seatedShow();
    const results = await Promise.all(Array.from({ length: 12 }, () => hold(ev.id, { ...SHOW_ONLY, quantity: 2 })));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const all = results.flatMap((r) => r.body.seatIds as string[]);
    expect(new Set(all).size).toBe(24);
    const held = (await seatRows(ev.id)).filter((s) => s.status === 'held');
    expect(held).toHaveLength(24);
  });
});
