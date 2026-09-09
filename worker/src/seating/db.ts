/**
 * Thin data layer over the `SEATING` D1 binding (v0.5). Every write is
 * idempotent (`INSERT OR IGNORE`, conditional `UPDATE`s) so a retry after a
 * KV failure converges. Holds/claims (P3), occupancy (P4) and reassignment
 * (P5) are added here phase by phase.
 */
import type { ChartDraft } from '@seating/types.ts';
import { allSeats } from '@seating/geometry.ts';

/**
 * D1 caps a statement at 100 bound parameters, so every `IN (…)` over an id
 * list must be split. 90 leaves room for the fixed binds around the list.
 */
export const BIND_CHUNK = 90;

export function chunk<T>(items: readonly T[], size = BIND_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** `?, ?, ?` for `n` binds. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

/** Proves the binding + migration are live: both tables answer. */
export async function ping(db: D1Database): Promise<{ seats: number; holds: number }> {
  const [seats, holds] = await db.batch([
    db.prepare('SELECT COUNT(*) AS n FROM seats'),
    db.prepare('SELECT COUNT(*) AS n FROM seat_holds'),
  ]);
  const count = (r: D1Result<{ n: number }>) => Number(r.results?.[0]?.n ?? 0);
  return { seats: count(seats as D1Result<{ n: number }>), holds: count(holds as D1Result<{ n: number }>) };
}

/* ── P2: attach a chart to a show ─────────────────────────────── */

/** Rows per statement: 6 binds each → 16 rows = 96 binds, under D1's 100-bind cap. */
const ROWS_PER_INSERT = 16;

/**
 * Create one `available` row per seat of the layout for `showId`. Existing
 * rows (same show + seat id) are left untouched, so re-running after a
 * partial failure — or a re-sync that keeps some seats — is safe.
 */
export async function materializeSeats(db: D1Database, showId: string, layout: Pick<ChartDraft, 'objects'>): Promise<number> {
  const seats = allSeats(layout);
  const now = Date.now();
  const statements = chunk(seats, ROWS_PER_INSERT).map((rows) => {
    const values = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const binds = rows.flatMap((s) => [showId, s.id, s.label, s.objectId, 'available', now]);
    return db
      .prepare(`INSERT OR IGNORE INTO seats (show_id, seat_id, label, object_id, status, updated_at) VALUES ${values}`)
      .bind(...binds);
  });
  if (statements.length) await db.batch(statements);
  return seats.length;
}

/** Drop every seat row and hold for a show (detach, re-sync, delete). */
export async function deleteShowSeats(db: D1Database, showId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM seats WHERE show_id = ?').bind(showId),
    db.prepare('DELETE FROM seat_holds WHERE show_id = ?').bind(showId),
  ]);
}

export interface SeatSummary {
  total: number;
  available: number;
  held: number;
  sold: number;
}

/** Counts per status; an expired hold counts as available. */
export async function seatSummary(db: D1Database, showId: string): Promise<SeatSummary> {
  const now = Date.now();
  const rows = await db
    .prepare(
      `SELECT
         CASE WHEN status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at < ?) THEN 'available' ELSE status END AS s,
         COUNT(*) AS n
       FROM seats WHERE show_id = ? GROUP BY s`,
    )
    .bind(now, showId)
    .all<{ s: string; n: number }>();
  const out: SeatSummary = { total: 0, available: 0, held: 0, sold: 0 };
  for (const r of rows.results ?? []) {
    const n = Number(r.n);
    out.total += n;
    if (r.s === 'available' || r.s === 'held' || r.s === 'sold') out[r.s] += n;
  }
  return out;
}

/* ── P3: holds ────────────────────────────────────────────────── */

export const HOLD_TTL_MS = 12 * 60 * 1000;

export interface HoldRow {
  id: string;
  show_id: string;
  seat_ids: string; // JSON array
  ticket_type: string;
  quantity: number;
  status: 'active' | 'converted' | 'released' | 'superseded';
  expires_at: number;
  square_order_id: string | null;
  square_link_id: string | null;
  party_key: string | null;
  created_at: number;
  updated_at: number;
}

export function newHoldId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return 'h_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Seat ids currently free for a show (available, or held past expiry). */
export async function freeSeatIds(db: D1Database, showId: string, now = Date.now()): Promise<Set<string>> {
  const rows = await db
    .prepare(
      `SELECT seat_id FROM seats WHERE show_id = ? AND (status = 'available' OR (status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at < ?)))`,
    )
    .bind(showId, now)
    .all<{ seat_id: string }>();
  return new Set((rows.results ?? []).map((r) => r.seat_id));
}

/** Per-seat public availability: `available` | `taken`. */
export async function availability(db: D1Database, showId: string, now = Date.now()): Promise<Record<string, 'available' | 'taken'>> {
  const rows = await db
    .prepare(`SELECT seat_id, status, hold_expires_at FROM seats WHERE show_id = ?`)
    .bind(showId)
    .all<{ seat_id: string; status: string; hold_expires_at: number | null }>();
  const out: Record<string, 'available' | 'taken'> = {};
  for (const r of rows.results ?? []) {
    const free = r.status === 'available' || (r.status === 'held' && (r.hold_expires_at === null || r.hold_expires_at < now));
    out[r.seat_id] = free ? 'available' : 'taken';
  }
  return out;
}

export interface ClaimResult {
  ok: boolean;
  /** Hold ids of expired holds whose seats were taken over (mark superseded, deactivate their links). */
  superseded: string[];
}

/**
 * Atomically mark `seatIds` held by `holdId` — only if every one is free (or
 * held past expiry). On a shortfall the partial claim is rolled back and
 * `ok` is false; the caller re-reads availability and chooses again.
 */
export async function claimSeats(db: D1Database, showId: string, seatIds: readonly string[], holdId: string, expiresAt: number, now = Date.now()): Promise<ClaimResult> {
  // Who is being superseded? (expired holds on these seats)
  const superseded = new Set<string>();
  for (const ids of chunk(seatIds)) {
    const rows = await db
      .prepare(`SELECT DISTINCT hold_id FROM seats WHERE show_id = ? AND status = 'held' AND hold_expires_at < ? AND hold_id IS NOT NULL AND seat_id IN (${placeholders(ids.length)})`)
      .bind(showId, now, ...ids)
      .all<{ hold_id: string }>();
    for (const r of rows.results ?? []) superseded.add(r.hold_id);
  }

  let changed = 0;
  const statements = chunk(seatIds).map((ids) =>
    db
      .prepare(
        `UPDATE seats SET status = 'held', hold_id = ?, hold_expires_at = ?, updated_at = ?
         WHERE show_id = ? AND seat_id IN (${placeholders(ids.length)})
           AND (status = 'available' OR (status = 'held' AND (hold_expires_at IS NULL OR hold_expires_at < ?)))`,
      )
      .bind(holdId, expiresAt, now, showId, ...ids, now),
  );
  const results = await db.batch(statements);
  for (const r of results) changed += Number(r.meta?.changes ?? 0);

  if (changed !== seatIds.length) {
    await db
      .prepare(`UPDATE seats SET status = 'available', hold_id = NULL, hold_expires_at = NULL, updated_at = ? WHERE hold_id = ?`)
      .bind(now, holdId)
      .run();
    return { ok: false, superseded: [] };
  }
  return { ok: true, superseded: [...superseded] };
}

export async function insertHold(db: D1Database, hold: Omit<HoldRow, 'square_order_id' | 'square_link_id' | 'party_key'>): Promise<void> {
  await db
    .prepare(
      `INSERT INTO seat_holds (id, show_id, seat_ids, ticket_type, quantity, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(hold.id, hold.show_id, hold.seat_ids, hold.ticket_type, hold.quantity, hold.status, hold.expires_at, hold.created_at, hold.updated_at)
    .run();
}

export async function getHold(db: D1Database, holdId: string): Promise<HoldRow | null> {
  const row = await db.prepare(`SELECT * FROM seat_holds WHERE id = ?`).bind(holdId).first<HoldRow>();
  return row ?? null;
}

export async function findHoldByOrder(db: D1Database, squareOrderId: string): Promise<HoldRow | null> {
  const row = await db
    .prepare(`SELECT * FROM seat_holds WHERE square_order_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(squareOrderId)
    .first<HoldRow>();
  return row ?? null;
}

export function holdSeatIds(hold: HoldRow): string[] {
  try {
    const ids = JSON.parse(hold.seat_ids) as unknown;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Free the seats of a hold and mark it `released` (idempotent). */
export async function releaseHold(db: D1Database, holdId: string, status: HoldRow['status'] = 'released', now = Date.now()): Promise<void> {
  await db.batch([
    db
      .prepare(`UPDATE seats SET status = 'available', hold_id = NULL, hold_expires_at = NULL, updated_at = ? WHERE hold_id = ? AND status = 'held'`)
      .bind(now, holdId),
    db.prepare(`UPDATE seat_holds SET status = ?, updated_at = ? WHERE id = ? AND status = 'active'`).bind(status, now, holdId),
  ]);
}

/** Mark superseded holds (their seats were taken over after expiry). */
export async function markSuperseded(db: D1Database, holdIds: readonly string[], now = Date.now()): Promise<void> {
  if (!holdIds.length) return;
  await db.batch(
    holdIds.map((id) => db.prepare(`UPDATE seat_holds SET status = 'superseded', updated_at = ? WHERE id = ? AND status = 'active'`).bind(now, id)),
  );
}

/** Record the minted Square link on the hold and restart the clock (checkout). */
export async function attachOrderToHold(db: D1Database, holdId: string, squareOrderId: string, squareLinkId: string, expiresAt: number, now = Date.now()): Promise<void> {
  await db.batch([
    db
      .prepare(`UPDATE seat_holds SET square_order_id = ?, square_link_id = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
      .bind(squareOrderId, squareLinkId, expiresAt, now, holdId),
    db.prepare(`UPDATE seats SET hold_expires_at = ?, updated_at = ? WHERE hold_id = ? AND status = 'held'`).bind(expiresAt, now, holdId),
  ]);
}

/**
 * Convert a hold into sold seats for `partyKey`. Seats still held by this
 * hold — or free again — become sold; seats lost to someone else are not
 * touched. Returns the seat ids the party actually won.
 */
export async function confirmHold(db: D1Database, hold: HoldRow, partyKey: string, now = Date.now()): Promise<string[]> {
  const ids = holdSeatIds(hold);
  const statements = chunk(ids).map((part) =>
    db
      .prepare(
        `UPDATE seats SET status = 'sold', party_key = ?, hold_id = NULL, hold_expires_at = NULL, updated_at = ?
         WHERE show_id = ? AND seat_id IN (${placeholders(part.length)})
           AND (hold_id = ? OR status = 'available' OR (status = 'held' AND hold_expires_at < ?))`,
      )
      .bind(partyKey, now, hold.show_id, ...part, hold.id, now),
  );
  statements.push(
    db.prepare(`UPDATE seat_holds SET status = 'converted', party_key = ?, updated_at = ? WHERE id = ?`).bind(partyKey, now, hold.id),
  );
  await db.batch(statements);
  const won = await db
    .prepare(`SELECT seat_id FROM seats WHERE show_id = ? AND party_key = ? ORDER BY seat_id`)
    .bind(hold.show_id, partyKey)
    .all<{ seat_id: string }>();
  return (won.results ?? []).map((r) => r.seat_id);
}

/* ── P4: live occupancy ───────────────────────────────────────── */

export interface SeatOccupancy {
  status: 'available' | 'held' | 'sold';
  /** The paymentId of the party sitting here (sold seats only). */
  partyId?: string;
}

/** Every seat of a show with who holds it; an expired hold reads as available. */
export async function occupancy(db: D1Database, showId: string, now = Date.now()): Promise<Record<string, SeatOccupancy>> {
  const rows = await db
    .prepare(`SELECT seat_id, status, hold_expires_at, party_key FROM seats WHERE show_id = ?`)
    .bind(showId)
    .all<{ seat_id: string; status: string; hold_expires_at: number | null; party_key: string | null }>();
  const prefix = `party:${showId}:`;
  const out: Record<string, SeatOccupancy> = {};
  for (const r of rows.results ?? []) {
    if (r.status === 'sold') {
      out[r.seat_id] = { status: 'sold', ...(r.party_key?.startsWith(prefix) ? { partyId: r.party_key.slice(prefix.length) } : {}) };
    } else if (r.status === 'held' && r.hold_expires_at !== null && r.hold_expires_at >= now) {
      out[r.seat_id] = { status: 'held' };
    } else {
      out[r.seat_id] = { status: 'available' };
    }
  }
  return out;
}
