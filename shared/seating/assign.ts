/**
 * Choosing seats FOR a party (v0.5 P3, LGD-17). Pure and unit-tested; the
 * Worker runs it against live availability and claims the result in the
 * same request, and P5 admin reassignment reuses it.
 *
 * Rule (DESIGN §6.2, Leif's call 2026-09-09):
 *   1. Together first — an object (table or row) with `quantity` free seats
 *      side by side (consecutive seat numbers; round tables wrap).
 *   2. Nearest the stage, without stranding a single seat — among fits
 *      prefer objects where placing the party does not leave exactly one
 *      free seat behind, then the smallest distance from the object's centre
 *      to the stage, then the tighter fit; within the object prefer the run
 *      that leaves the remaining free seats contiguous.
 *   3. Split only when necessary — take the largest run, then fill from the
 *      nearest objects (by centre distance) with the fewest pieces.
 *   4. `objectId` restricts step 1 to one object (Change table); no split.
 */
import type { ChartDraft, ChartObject, SeatedObject } from './types.ts';
import { objectCenter, seatPositions, type Point } from './geometry.ts';
import { parseSeatId, seatId, seatLabel } from './ids.ts';

export interface SeatRun {
  objectId: string;
  /** 1-based seat numbers in order along the run. */
  seats: number[];
}

export interface Assignment {
  seatIds: string[];
  seatLabels: string[];
  /** Objects used, in the order the party was placed. */
  objects: { id: string; label: string; kind: SeatedObject['kind']; seats: number[] }[];
  /** True when the party could not be seated at one object. */
  split: boolean;
}

export interface AssignOptions {
  /** Restrict the choice to this object (Change table). */
  objectId?: string;
  /** Allow splitting across objects when nothing fits (default true; ignored with objectId). */
  allowSplit?: boolean;
}

function seated(o: ChartObject): o is SeatedObject {
  return o.kind !== 'stage';
}

/** Free seat numbers of one object, ascending. */
export function freeSeatNumbers(o: SeatedObject, freeIds: ReadonlySet<string>): number[] {
  const out: number[] = [];
  for (let n = 1; n <= o.seats; n++) if (freeIds.has(seatId(o.id, n))) out.push(n);
  return out;
}

/**
 * Maximal runs of consecutive free seats. Round tables wrap (seat N is next
 * to seat 1); a fully free round table is one run starting at seat 1.
 */
export function freeRuns(o: SeatedObject, freeIds: ReadonlySet<string>): number[][] {
  const free = freeSeatNumbers(o, freeIds);
  if (free.length === 0) return [];
  const runs: number[][] = [];
  let cur: number[] = [free[0]];
  for (let i = 1; i < free.length; i++) {
    if (free[i] === free[i - 1] + 1) cur.push(free[i]);
    else {
      runs.push(cur);
      cur = [free[i]];
    }
  }
  runs.push(cur);
  // Wrap: join the last run into the first when seat N and seat 1 are both free.
  if (o.kind === 'round' && runs.length > 1) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (first[0] === 1 && last[last.length - 1] === o.seats) {
      runs[0] = [...last, ...first];
      runs.pop();
    }
  }
  return runs;
}

/** Can this object seat `n` side by side? */
export function objectFits(o: ChartObject, freeIds: ReadonlySet<string>, n: number): boolean {
  return seated(o) && freeRuns(o, freeIds).some((r) => r.length >= n);
}

function stageCenter(layout: Pick<ChartDraft, 'objects' | 'canvas'>): Point {
  const stage = layout.objects.find((o) => o.kind === 'stage');
  return stage ? objectCenter(stage) : { x: layout.canvas.width / 2, y: 0 };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Pick the run within one object: prefer the run that leaves the object's
 * remaining free seats in the fewest pieces (take from the end of a run,
 * not the middle), then the lowest seat numbers.
 */
function bestRunInObject(o: SeatedObject, freeIds: ReadonlySet<string>, n: number): number[] | null {
  const runs = freeRuns(o, freeIds);
  let best: { run: number[]; pieces: number } | null = null;
  for (const run of runs) {
    if (run.length < n) continue;
    // Taking from either end leaves one piece (or zero); taking from the middle leaves two.
    const candidates = run.length === n ? [run] : [run.slice(0, n), run.slice(run.length - n)];
    for (const c of candidates) {
      const pieces = run.length === n ? 0 : 1;
      if (!best || pieces < best.pieces || (pieces === best.pieces && c[0] < best.run[0])) best = { run: c, pieces };
    }
  }
  return best?.run ?? null;
}

function toAssignment(layout: Pick<ChartDraft, 'objects'>, parts: SeatRun[]): Assignment {
  const byId = new Map(layout.objects.map((o) => [o.id, o]));
  const seatIds: string[] = [];
  const seatLabels: string[] = [];
  const objects: Assignment['objects'] = [];
  for (const part of parts) {
    const o = byId.get(part.objectId);
    if (!o || !seated(o)) continue;
    objects.push({ id: o.id, label: o.label, kind: o.kind, seats: part.seats });
    for (const n of part.seats) {
      seatIds.push(seatId(o.id, n));
      seatLabels.push(seatLabel(o, n));
    }
  }
  return { seatIds, seatLabels, objects, split: objects.length > 1 };
}

/**
 * Choose `quantity` seats for a party from `freeIds`. Returns null when the
 * party cannot be seated at all (not even split).
 */
export function chooseSeats(
  layout: Pick<ChartDraft, 'objects' | 'canvas'>,
  freeIds: ReadonlySet<string>,
  quantity: number,
  opts: AssignOptions = {},
): Assignment | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const stage = stageCenter(layout);
  const pool = layout.objects.filter(seated).filter((o) => !opts.objectId || o.id === opts.objectId);

  // 1 + 2: together; front first; never strand a lone seat if another table avoids it.
  const fits = pool
    .map((o) => ({ o, free: freeSeatNumbers(o, freeIds).length, run: bestRunInObject(o, freeIds, quantity), d: dist(objectCenter(o), stage) }))
    .filter((c): c is typeof c & { run: number[] } => c.run !== null)
    .map((c) => ({ ...c, strands: c.free - quantity === 1 ? 1 : 0 }))
    .sort((a, b) => a.strands - b.strands || a.d - b.d || a.free - b.free || a.o.label.localeCompare(b.o.label));
  if (fits.length) return toAssignment(layout, [{ objectId: fits[0].o.id, seats: fits[0].run }]);

  if (opts.objectId || opts.allowSplit === false) return null;

  // 3: split — largest run first, then fill from the nearest objects, fewest pieces.
  const remainingFree = new Set(freeIds);
  const parts: SeatRun[] = [];
  let need = quantity;
  let anchor: Point | null = null;
  while (need > 0) {
    const options = pool
      .map((o) => ({ o, runs: freeRuns(o, remainingFree), d: anchor ? dist(objectCenter(o), anchor) : dist(objectCenter(o), stage) }))
      .map((c) => ({ ...c, best: c.runs.reduce<number[]>((m, r) => (r.length > m.length ? r : m), []) }))
      .filter((c) => c.best.length > 0)
      .sort((a, b) => {
        // Prefer a run that finishes the party, else the largest run; then nearest.
        const af = a.best.length >= need ? 1 : 0;
        const bf = b.best.length >= need ? 1 : 0;
        if (af !== bf) return bf - af;
        if (af === 1) return a.d - b.d || a.best.length - b.best.length;
        return b.best.length - a.best.length || a.d - b.d;
      });
    if (!options.length) return null;
    const pick = options[0];
    const take = pick.best.length >= need ? (bestRunInObject(pick.o, remainingFree, need) ?? pick.best.slice(0, need)) : pick.best;
    parts.push({ objectId: pick.o.id, seats: take });
    for (const n of take) remainingFree.delete(seatId(pick.o.id, n));
    need -= take.length;
    anchor = anchor ?? objectCenter(pick.o);
  }
  return toAssignment(layout, parts);
}

/** Group seat ids by object with their numbers (for messages and diagrams). */
export function groupSeatIds(layout: Pick<ChartDraft, 'objects'>, seatIds: readonly string[]): Assignment['objects'] {
  const byId = new Map(layout.objects.map((o) => [o.id, o]));
  const groups = new Map<string, number[]>();
  for (const id of seatIds) {
    const p = parseSeatId(id);
    if (!p) continue;
    groups.set(p.objectId, [...(groups.get(p.objectId) ?? []), p.n]);
  }
  const out: Assignment['objects'] = [];
  for (const [objectId, seats] of groups) {
    const o = byId.get(objectId);
    if (o && seated(o)) out.push({ id: o.id, label: o.label, kind: o.kind, seats: seats.sort((a, b) => a - b) });
  }
  return out;
}

/** "Table 3" / "Row A" for buyer-facing copy. */
export function objectNoun(o: { kind: SeatedObject['kind']; label: string }): string {
  const label = o.label.trim();
  if (o.kind === 'row') return /^row/i.test(label) ? label : `Row ${label}`;
  // Labels are usually "T3"; read them as "Table 3". Anything else is used as-is.
  const m = label.match(/^T\s*(\d+)$/i);
  return m ? `Table ${m[1]}` : /^table/i.test(label) ? label : `Table ${label}`;
}

/** "seats 3–4" / "seat 5" / "seats 2, 4" */
export function seatNumbersPhrase(seats: readonly number[]): string {
  if (seats.length === 0) return '';
  if (seats.length === 1) return `seat ${seats[0]}`;
  const sorted = [...seats].sort((a, b) => a - b);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return contiguous ? `seats ${sorted[0]}–${sorted[sorted.length - 1]}` : `seats ${sorted.join(', ')}`;
}

/** The reassurance line: "together at Table 3" / "at Tables 3 and 4, right beside each other". */
export function describeAssignment(objects: Assignment['objects']): string {
  if (objects.length === 0) return '';
  if (objects.length === 1) return `together at ${objectNoun(objects[0])}`;
  const nouns = objects.map(objectNoun);
  const list = nouns.length === 2 ? `${nouns[0]} and ${nouns[1]}` : `${nouns.slice(0, -1).join(', ')} and ${nouns[nouns.length - 1]}`;
  return `at ${list}, right beside each other`;
}

/** Positions of a set of seat ids (for fitting the diagram). */
export function seatPointsFor(layout: Pick<ChartDraft, 'objects'>, seatIds: readonly string[]): Point[] {
  const want = new Set(seatIds);
  const out: Point[] = [];
  for (const o of layout.objects) for (const s of seatPositions(o)) if (want.has(s.id)) out.push({ x: s.x, y: s.y });
  return out;
}
