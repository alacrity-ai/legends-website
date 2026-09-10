/**
 * Fixtures shared by the worker suites. Everything goes through the real admin
 * API (KV + R2 + D1 in miniflare) so a test exercises the same code a deploy
 * runs; only Square is stubbed via `fetchMock`.
 */
import { SELF, env, fetchMock } from 'cloudflare:test';
import { beforeEach, expect } from 'vitest';
import type { EventRecord } from '../src/types.ts';

export const PASS = 'test-passcode';
export const AUTH = { Authorization: `Bearer ${PASS}` };
export const JSON_H = { 'Content-Type': 'application/json' };
export const ORIGIN = 'http://example.com';
/** 1×1 PNG, the same one the admin form would upload. */
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
export const SQUARE = 'https://connect.squareupsandbox.com';

/** Stage across the top; T1 T2 T3 across the front (8 each); T4 T5(6) T6 behind; Row A (12) at the back. */
export const ROOM = {
  name: 'Elks Lodge (tests)',
  canvas: { width: 1200, height: 800 },
  objects: [
    { id: 'o_s', kind: 'stage', x: 400, y: 20, width: 400, height: 80, rotation: 0, label: 'Stage' },
    { id: 'o_1', kind: 'round', x: 250, y: 260, radius: 60, seats: 8, label: 'T1', rotation: 0 },
    { id: 'o_2', kind: 'round', x: 600, y: 260, radius: 60, seats: 8, label: 'T2', rotation: 0 },
    { id: 'o_3', kind: 'round', x: 950, y: 260, radius: 60, seats: 8, label: 'T3', rotation: 0 },
    { id: 'o_4', kind: 'round', x: 250, y: 520, radius: 60, seats: 8, label: 'T4', rotation: 0 },
    { id: 'o_5', kind: 'round', x: 600, y: 520, radius: 60, seats: 6, label: 'T5', rotation: 0 },
    { id: 'o_6', kind: 'round', x: 950, y: 520, radius: 60, seats: 8, label: 'T6', rotation: 0 },
    { id: 'o_r', kind: 'row', x: 200, y: 720, seats: 12, pitch: 45, label: 'A', rotation: 0 },
  ],
};
export const ROOM_SEATS = 8 * 5 + 6 + 12; // 58

export async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await SELF.fetch(ORIGIN + path, init);
  const text = await res.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

export const admin = (path: string, init: RequestInit = {}) =>
  api(path, { ...init, headers: { ...AUTH, ...(init.body ? JSON_H : {}), ...(init.headers as Record<string, string>) } });

/** Chart names are unique per account, so each fixture gets its own suffix. */
export async function createChart(layout: typeof ROOM = ROOM): Promise<string> {
  const name = `${layout.name} ${crypto.randomUUID().slice(0, 8)}`;
  const r = await admin('/api/admin/charts', { method: 'POST', body: JSON.stringify({ ...layout, name }) });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.chart.id as string;
}

export interface CreateEventOpts {
  seatingChartId?: string | null;
  capacity?: number | null;
  tickets?: Array<{ ticketType: string; price: number }>;
  startTime?: string;
  endTime?: string;
  venueAddress?: string;
}

export async function createEvent(opts: CreateEventOpts = {}): Promise<EventRecord> {
  const r = await admin('/api/admin/events', {
    method: 'POST',
    body: JSON.stringify({
      showName: opts.seatingChartId ? 'Rat Pack Night' : 'Summer GA Show',
      description: 'A night of legends.',
      venueName: 'Billerica Elks',
      venueAddress: opts.venueAddress ?? '14 Webb Brook Rd, Billerica, MA 01821',
      startTime: opts.startTime ?? '2027-06-01T20:00:00-04:00',
      endTime: opts.endTime ?? '2027-06-01T23:00:00-04:00',
      tickets: opts.tickets ?? [
        { ticketType: 'Show Only', price: 39.95 },
        { ticketType: 'Dinner + Show', price: 59.95 },
      ],
      image: PNG,
      ...(opts.capacity !== undefined ? { capacity: opts.capacity } : {}),
      ...(opts.seatingChartId ? { seatingChartId: opts.seatingChartId } : {}),
    }),
  });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.event as EventRecord;
}

/** A seated show on the standard room, ready to sell. */
export async function seatedShow(): Promise<EventRecord> {
  return createEvent({ seatingChartId: await createChart() });
}

/* ── D1 peeks / seeding ───────────────────────────────────────── */

export const seatIds = (obj: string, ns: number[]) => ns.map((n) => `${obj}.${n}`);
export const allOf = (obj: string, n: number) => seatIds(obj, Array.from({ length: n }, (_, i) => i + 1));

export async function markSold(showId: string, ids: string[], partyKey = `party:${showId}:staged`): Promise<void> {
  for (const id of ids) {
    await env.SEATING.prepare(`UPDATE seats SET status='sold', party_key=?, hold_id=NULL, hold_expires_at=NULL WHERE show_id=? AND seat_id=?`).bind(partyKey, showId, id).run();
  }
}

export async function seatRows(showId: string): Promise<Array<{ seat_id: string; status: string; hold_id: string | null; hold_expires_at: number | null; party_key: string | null }>> {
  const r = await env.SEATING.prepare(`SELECT seat_id, status, hold_id, hold_expires_at, party_key FROM seats WHERE show_id=? ORDER BY seat_id`).bind(showId).all();
  return r.results as any;
}

export async function seatStatus(showId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const r of await seatRows(showId)) out[r.seat_id] = r.status;
  return out;
}

export async function holdRow(holdId: string): Promise<any> {
  return env.SEATING.prepare(`SELECT * FROM seat_holds WHERE id=?`).bind(holdId).first();
}

/** Age a hold past its TTL (what the clock would do 12 minutes later). */
export async function expireHold(holdId: string): Promise<void> {
  const past = Date.now() - 1000;
  await env.SEATING.prepare(`UPDATE seat_holds SET expires_at=? WHERE id=?`).bind(past, holdId).run();
  await env.SEATING.prepare(`UPDATE seats SET hold_expires_at=? WHERE hold_id=?`).bind(past, holdId).run();
}

export async function eventRecord(id: string): Promise<EventRecord> {
  return JSON.parse((await env.EVENTS.get(`event:${id}`)) as string) as EventRecord;
}

/* ── Public buyer calls ───────────────────────────────────────── */

export const hold = (eventId: string, body: Record<string, unknown>) =>
  api(`/api/events/${eventId}/seats/hold`, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) });
export const release = (eventId: string, holdId: string) => api(`/api/events/${eventId}/seats/hold/${holdId}`, { method: 'DELETE' });
export const seating = (eventId: string, qty: number) => api(`/api/events/${eventId}/seating?quantity=${qty}`);
export const checkout = (eventId: string, body: Record<string, unknown>) =>
  api(`/api/events/${eventId}/checkout`, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) });

/* ── Square stubs ─────────────────────────────────────────────── */

export interface SquareMock {
  /** Bodies of every CreatePaymentLink call, in order. */
  links: any[];
  /** Payment-link ids passed to DELETE (deactivations). */
  deactivated: string[];
  /** Bodies of every CreateLocation call. Must stay EMPTY — Square bills $149/month per location. */
  locations: any[];
}

let linkSeq = 0;
beforeEach(() => {
  linkSeq = 0;
});

/** Stub the Square calls a checkout makes; each minted link gets a unique order id. */
export function mockSquareCheckout(): SquareMock {
  const m: SquareMock = { links: [], deactivated: [], locations: [] };
  const pool = fetchMock.get(SQUARE);
  pool
    .intercept({ method: 'POST', path: '/v2/locations' })
    .reply(200, (opts) => {
      m.locations.push(JSON.parse(String(opts.body)));
      return { location: { id: 'L-VENUE' } };
    })
    .persist();
  pool
    .intercept({ method: 'POST', path: '/v2/online-checkout/payment-links' })
    .reply(200, (opts) => {
      const body = JSON.parse(String(opts.body));
      m.links.push(body);
      const n = ++linkSeq;
      return { payment_link: { id: `PL${n}`, url: `https://sandbox.square.link/u/PL${n}`, order_id: `ORD${n}` } };
    })
    .persist();
  pool
    .intercept({ method: 'DELETE', path: /^\/v2\/online-checkout\/payment-links\/(.+)$/ })
    .reply(200, (opts) => {
      m.deactivated.push(opts.path.split('/').pop() as string);
      return {};
    })
    .persist();
  return m;
}

/** Square down: CreatePaymentLink answers 500 with an error list. */
export function mockSquareDown(): void {
  const pool = fetchMock.get(SQUARE);
  pool.intercept({ method: 'POST', path: '/v2/locations' }).reply(200, { location: { id: 'L-VENUE' } }).persist();
  pool
    .intercept({ method: 'POST', path: '/v2/online-checkout/payment-links' })
    .reply(500, { errors: [{ detail: 'Service unavailable', code: 'SERVICE_UNAVAILABLE' }] })
    .persist();
}

export interface PaidOrder {
  orderId: string;
  paymentId: string;
  note: string;
  name?: string;
  email?: string;
  amountCents?: number;
}

/** Stub the order / payment / customer lookups the webhook performs for one paid order. */
export function mockSquarePaid(o: PaidOrder): void {
  const pool = fetchMock.get(SQUARE);
  pool
    .intercept({ method: 'GET', path: `/v2/orders/${o.orderId}` })
    .reply(200, {
      order: {
        tenders: [{ note: o.note }],
        fulfillments: [{ delivery_details: { note: `Full name (for the guest list): ${o.name ?? 'Frank Sinatra'}` } }],
      },
    })
    .persist();
  pool
    .intercept({ method: 'GET', path: `/v2/payments/${o.paymentId}` })
    .reply(200, {
      payment: { note: o.note, buyer_email_address: o.email ?? 'frank@example.com', customer_id: 'CUST1', amount_money: { amount: o.amountCents ?? 7990, currency: 'USD' } },
    })
    .persist();
  pool
    .intercept({ method: 'GET', path: '/v2/customers/CUST1' })
    .reply(200, { customer: { given_name: 'Frank', family_name: 'Sinatra', phone_number: '+19785550100' } })
    .persist();
}

export async function signWebhook(url: string, rawBody: string, key = 'whsec-test'): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', k, enc.encode(url + rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

export function paymentUpdated(paymentId: string, orderId: string, status = 'COMPLETED'): string {
  return JSON.stringify({ type: 'payment.updated', event_id: `evt-${paymentId}`, data: { object: { payment: { id: paymentId, status, order_id: orderId } } } });
}
