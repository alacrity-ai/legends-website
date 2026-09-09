/**
 * Fixtures for the browser tests: shows and charts are created through the
 * real admin API; seat state is staged straight in the worker's local D1
 * (what a night of sales would leave behind).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PASSCODE, WORKER } from '../playwright.config.ts';

const WORKER_DIR = fileURLToPath(new URL('../../../worker', import.meta.url));
const AUTH = { Authorization: `Bearer ${PASSCODE}` };
const JSON_H = { 'Content-Type': 'application/json' };
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Stage across the top; T1 T2 T3 front (8 each); T4 T5(6) T6 behind; Row A (12) at the back. */
export const ROOM = {
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

export async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(WORKER + path, init);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

export const admin = (path: string, init: RequestInit = {}) =>
  api(path, { ...init, headers: { ...AUTH, ...(init.body ? JSON_H : {}), ...(init.headers as Record<string, string>) } });

export async function createChart(name = 'Elks Lodge'): Promise<string> {
  const r = await admin('/api/admin/charts', { method: 'POST', body: JSON.stringify({ ...ROOM, name: `${name} ${Date.now().toString(36)}` }) });
  if (r.status !== 200) throw new Error(`chart create ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.chart.id;
}

export interface Show {
  id: string;
  showName: string;
}

export async function createShow(opts: { seatingChartId?: string; capacity?: number; name?: string } = {}): Promise<Show> {
  const r = await admin('/api/admin/events', {
    method: 'POST',
    body: JSON.stringify({
      showName: opts.name ?? (opts.seatingChartId ? 'Rat Pack Night' : 'Summer GA Show'),
      description: 'Dinner seating at the Elks. Doors 7, show 8.',
      venueName: 'Billerica Elks',
      venueAddress: '14 Webb Brook Rd, Billerica, MA 01821',
      startTime: '2027-06-01T20:00:00-04:00',
      endTime: '2027-06-01T23:00:00-04:00',
      tickets: [
        { ticketType: 'Show Only', price: 39.95 },
        { ticketType: 'Dinner + Show', price: 59.95 },
      ],
      image: PNG,
      ...(opts.capacity !== undefined ? { capacity: opts.capacity } : {}),
      ...(opts.seatingChartId ? { seatingChartId: opts.seatingChartId } : {}),
    }),
  });
  if (r.status !== 200) throw new Error(`event create ${r.status}: ${JSON.stringify(r.body)}`);
  return { id: r.body.event.id, showName: r.body.event.showName };
}

export async function seatedShow(): Promise<Show> {
  return createShow({ seatingChartId: await createChart() });
}

export async function deleteShow(id: string): Promise<void> {
  await admin(`/api/admin/events/${id}`, { method: 'DELETE' });
}

export async function deleteChart(id: string): Promise<void> {
  await admin(`/api/admin/charts/${id}`, { method: 'DELETE' });
}

/* ── D1 staging (shares the worker's e2e state dir) ───────────── */

function d1(sql: string): string {
  return execFileSync('npx', ['wrangler', 'd1', 'execute', 'legends-seating', '--local', '--persist-to', '.wrangler/e2e-state', '--json', '--command', sql], {
    cwd: WORKER_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

const quoted = (ids: string[]) => ids.map((id) => `'${id}'`).join(',');
export const seatIds = (obj: string, ns: number[]) => ns.map((n) => `${obj}.${n}`);
export const allOf = (obj: string, n: number) => seatIds(obj, Array.from({ length: n }, (_, i) => i + 1));

/** Mark seats sold (one round trip for the whole list). */
export function markSold(showId: string, ids: string[], partyKey = `party:${showId}:staged`): void {
  if (!ids.length) return;
  d1(`UPDATE seats SET status='sold', party_key='${partyKey}', hold_id=NULL, hold_expires_at=NULL WHERE show_id='${showId}' AND seat_id IN (${quoted(ids)})`);
}

export function seatStatuses(showId: string): Record<string, string> {
  const out = JSON.parse(d1(`SELECT seat_id, status FROM seats WHERE show_id='${showId}'`)) as Array<{ results: Array<{ seat_id: string; status: string }> }>;
  return Object.fromEntries(out[0].results.map((r) => [r.seat_id, r.status]));
}

export function activeHolds(showId: string): number {
  const out = JSON.parse(d1(`SELECT COUNT(*) AS n FROM seat_holds WHERE show_id='${showId}' AND status='active'`)) as Array<{ results: Array<{ n: number }> }>;
  return Number(out[0].results[0].n);
}

/** Stage "a busy night": T1, T3, T5 full; T2 6/8; T4 4/8; T6 5/8; Row A 8/12. */
export function stageBusyNight(showId: string): void {
  markSold(showId, [
    ...allOf('o_1', 8),
    ...seatIds('o_2', [1, 2, 3, 4, 5, 6]),
    ...allOf('o_3', 8),
    ...seatIds('o_4', [1, 2, 3, 4]),
    ...allOf('o_5', 6),
    ...seatIds('o_6', [1, 2, 3, 4, 5]),
    ...seatIds('o_r', [1, 2, 3, 4, 5, 6, 7, 8]),
  ]);
}

/** Only T2 seats 7–8 and Row A seat 12 remain. */
export function stageThreeLeft(showId: string): void {
  markSold(showId, [
    ...allOf('o_1', 8),
    ...seatIds('o_2', [1, 2, 3, 4, 5, 6]),
    ...allOf('o_3', 8),
    ...allOf('o_4', 8),
    ...allOf('o_5', 6),
    ...allOf('o_6', 8),
    ...seatIds('o_r', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  ]);
}

export function stageSoldOut(showId: string): void {
  markSold(showId, [...allOf('o_1', 8), ...allOf('o_2', 8), ...allOf('o_3', 8), ...allOf('o_4', 8), ...allOf('o_5', 6), ...allOf('o_6', 8), ...allOf('o_r', 12)]);
}
