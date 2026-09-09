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
