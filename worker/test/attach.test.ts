/**
 * Attaching a chart to a show (P2): snapshot, seat materialization, capacity,
 * public flag, re-sync rules, detach and delete cleanup. Plus the admin gate.
 */
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { ROOM, ROOM_SEATS, admin, api, createChart, createEvent, eventRecord, markSold, mockSquareCheckout, seatRows, seatedShow } from './helpers.ts';

describe('admin gate', () => {
  it('refuses chart and event admin calls without the passcode', async () => {
    expect((await api('/api/admin/charts')).status).toBe(401);
    expect((await api('/api/admin/events')).status).toBe(401);
    expect((await api('/api/admin/charts', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
  });
});

describe('attach on create', () => {
  it('snapshots the layout, materializes one row per seat and sets capacity to the seat count', async () => {
    const chartId = await createChart();
    const ev = await createEvent({ seatingChartId: chartId, capacity: 500 });
    expect(ev.capacity).toBe(ROOM_SEATS);
    expect(ev.seating).toMatchObject({ chartId, chartName: expect.stringContaining(ROOM.name), chartRevision: 1, seatCount: ROOM_SEATS });
    expect((await eventRecord(ev.id)).seating?.layout.objects).toHaveLength(8);
    const rows = await seatRows(ev.id);
    expect(rows).toHaveLength(ROOM_SEATS);
    expect(rows.every((r) => r.status === 'available')).toBe(true);
    const labels = await env.SEATING.prepare(`SELECT label FROM seats WHERE show_id=? AND seat_id IN ('o_2.3','o_r.12')`).bind(ev.id).all<{ label: string }>();
    expect(labels.results.map((r) => r.label).sort()).toEqual(['A12', 'T2-3']);
  });

  it('refuses an unknown chart and one with no seats', async () => {
    const r = await admin('/api/admin/events', { method: 'POST', body: JSON.stringify({ showName: 'x', description: 'x', venueName: 'v', venueAddress: '1 Main St, Lowell, MA 01852', startTime: '2027-06-01T20:00:00-04:00', endTime: '2027-06-01T23:00:00-04:00', tickets: [{ ticketType: 'Show Only', price: 10 }], image: (await import('./helpers.ts')).PNG, seatingChartId: 'c_00000000' }) });
    expect(r.status).toBe(404);
    const empty = await admin('/api/admin/charts', { method: 'POST', body: JSON.stringify({ name: 'Empty', canvas: { width: 800, height: 600 }, objects: [ROOM.objects[0]] }) });
    expect(empty.status).toBe(200);
    const r2 = await admin('/api/admin/events', { method: 'POST', body: JSON.stringify({ showName: 'x', description: 'x', venueName: 'v', venueAddress: '1 Main St, Lowell, MA 01852', startTime: '2027-06-01T20:00:00-04:00', endTime: '2027-06-01T23:00:00-04:00', tickets: [{ ticketType: 'Show Only', price: 10 }], image: (await import('./helpers.ts')).PNG, seatingChartId: empty.body.chart.id }) });
    expect(r2.status).toBe(400);
    expect((await env.EVENTS.list({ prefix: 'event:' })).keys).toHaveLength(0);
  });

  it('shows the public feed a seating flag only for seated shows, never the layout', async () => {
    const ev = await seatedShow();
    const ga = await createEvent({ capacity: 120 });
    const feed = await api('/api/events');
    expect(feed.status).toBe(200);
    const seated = feed.body.events.find((e: { id: string }) => e.id === ev.id);
    const general = feed.body.events.find((e: { id: string }) => e.id === ga.id);
    expect(seated.seating).toEqual({ seatCount: ROOM_SEATS });
    expect(general.seating).toBeUndefined();
    expect(JSON.stringify(feed.body)).not.toContain('"objects"');
  });
});

describe('after tickets sell', () => {
  it('re-sync and chart swaps are refused once a seat is sold, and still allowed before', async () => {
    const ev = await seatedShow();
    const ok = await admin(`/api/admin/events/${ev.id}/seating/resync`, { method: 'POST' });
    expect(ok.status).toBe(200);
    await markSold(ev.id, ['o_2.1']);
    await env.EVENTS.put(`event:${ev.id}`, JSON.stringify({ ...(await eventRecord(ev.id)), sold: 1 }));
    const no = await admin(`/api/admin/events/${ev.id}/seating/resync`, { method: 'POST' });
    expect(no.status).toBe(409);
    expect(no.body.error).toBe('This show has sold 1 ticket; seating cannot be changed.');
    const swap = await admin(`/api/admin/events/${ev.id}`, { method: 'PATCH', body: JSON.stringify({ seatingChartId: null }) });
    expect(swap.status).toBe(409);
    expect((await seatRows(ev.id)).find((r) => r.seat_id === 'o_2.1')?.status).toBe('sold');
  });

  it('re-sync picks up a master-chart edit while nothing has sold', async () => {
    const chartId = await createChart();
    const ev = await createEvent({ seatingChartId: chartId });
    const chart = (await admin(`/api/admin/charts/${chartId}`)).body.chart;
    const bigger = { name: chart.name, canvas: chart.canvas, revision: chart.revision, objects: [...chart.objects, { id: 'o_7', kind: 'round', x: 600, y: 650, radius: 60, seats: 8, label: 'T7', rotation: 0 }] };
    const put = await admin(`/api/admin/charts/${chartId}`, { method: 'PUT', body: JSON.stringify(bigger) });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await eventRecord(ev.id)).seating?.seatCount).toBe(ROOM_SEATS); // snapshot untouched by the edit
    const r = await admin(`/api/admin/events/${ev.id}/seating/resync`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(r.body.event.seating.seatCount).toBe(ROOM_SEATS + 8);
    expect(r.body.event.capacity).toBe(ROOM_SEATS + 8);
    expect(await seatRows(ev.id)).toHaveLength(ROOM_SEATS + 8);
  });
});

describe('detach and delete', () => {
  it('detaching drops the snapshot and seat rows', async () => {
    const ev = await seatedShow();
    const r = await admin(`/api/admin/events/${ev.id}`, { method: 'PATCH', body: JSON.stringify({ seatingChartId: null }) });
    expect(r.status).toBe(200);
    expect(r.body.event.seating).toBeUndefined();
    expect(await seatRows(ev.id)).toHaveLength(0);
    expect((await api(`/api/events/${ev.id}/seating?quantity=1`)).status).toBe(404);
  });

  it('deleting a show removes its seats and holds', async () => {
    mockSquareCheckout();
    const ev = await seatedShow();
    await api(`/api/events/${ev.id}/seats/hold`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketType: 'Show Only', quantity: 2 }) });
    expect((await admin(`/api/admin/events/${ev.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await seatRows(ev.id)).toHaveLength(0);
    const holds = await env.SEATING.prepare('SELECT COUNT(*) AS n FROM seat_holds WHERE show_id=?').bind(ev.id).first<{ n: number }>();
    expect(holds?.n).toBe(0);
  });
});
