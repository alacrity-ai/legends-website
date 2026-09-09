/**
 * Thin data layer over the `SEATING` D1 binding (v0.5). P0 ships only the
 * plumbing every later phase needs: the bind-chunk helper and a ping used by
 * the deploy verification. Seat materialization (P2), holds/claims (P3),
 * occupancy (P4) and reassignment (P5) are added here phase by phase.
 */

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
