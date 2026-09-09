/**
 * Pure geometry over the chart object union: where each seat sits, what a
 * given object covers, and what is under a point. No DOM, no React — the
 * Worker imports this too.
 */
import type {
  Bounds,
  ChartObject,
  RectObject,
  RoundObject,
  RowObject,
  SeatPosition,
  SeatingChart,
  ChartDraft,
} from './types.ts';
import { seatId, seatLabel } from './ids.ts';

/** Seat circle radius, in canvas units. */
export const SEAT_RADIUS = 14;
/** Gap between a table's edge and the seat circle's centre. */
export const SEAT_OFFSET = 22;

export interface Point {
  x: number;
  y: number;
}

const DEG = Math.PI / 180;

/** Rotate `p` around `anchor` by `deg` degrees (clockwise in SVG's y-down space). */
export function rotatePoint(p: Point, anchor: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y };
  const rad = deg * DEG;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - anchor.x;
  const dy = p.y - anchor.y;
  return { x: anchor.x + dx * cos - dy * sin, y: anchor.y + dx * sin + dy * cos };
}

function anchorOf(o: ChartObject): Point {
  return { x: o.x, y: o.y };
}

/** Number of seats an object contributes. */
export function objectSeatCount(o: ChartObject): number {
  return o.kind === 'stage' ? 0 : o.seats;
}

/** Total seats in a layout. */
export function seatCount(layout: Pick<ChartDraft, 'objects'>): number {
  return layout.objects.reduce((sum, o) => sum + objectSeatCount(o), 0);
}

/**
 * Seat centres for one object, in seat-number order (1-based). Round tables
 * start at the top (12 o'clock) and go clockwise; rect tables number the
 * first long side left→right then the second; rows go from the anchor along
 * +x. Rotation is applied about the object's anchor.
 */
export function seatPositions(o: ChartObject): SeatPosition[] {
  switch (o.kind) {
    case 'stage':
      return [];
    case 'round':
      return roundSeats(o);
    case 'rect':
      return rectSeats(o);
    case 'row':
      return rowSeats(o);
  }
}

function pos(o: ChartObject, n: number, p: Point): SeatPosition {
  const rotated = rotatePoint(p, anchorOf(o), o.rotation);
  return { id: seatId(o.id, n), label: seatLabel(o, n), objectId: o.id, n, x: rotated.x, y: rotated.y };
}

function roundSeats(o: RoundObject): SeatPosition[] {
  const ring = o.radius + SEAT_OFFSET;
  const out: SeatPosition[] = [];
  for (let n = 1; n <= o.seats; n++) {
    const angle = (-90 + ((n - 1) * 360) / o.seats) * DEG;
    out.push(pos(o, n, { x: o.x + ring * Math.cos(angle), y: o.y + ring * Math.sin(angle) }));
  }
  return out;
}

function rectSeats(o: RectObject): SeatPosition[] {
  const out: SeatPosition[] = [];
  const first = Math.ceil(o.seats / 2);
  const second = o.seats - first;
  if (o.width >= o.height) {
    // Long sides are top and bottom.
    for (let i = 0; i < first; i++) {
      out.push(pos(o, i + 1, { x: o.x + (o.width * (i + 0.5)) / first, y: o.y - SEAT_OFFSET }));
    }
    for (let i = 0; i < second; i++) {
      out.push(
        pos(o, first + i + 1, { x: o.x + (o.width * (i + 0.5)) / second, y: o.y + o.height + SEAT_OFFSET }),
      );
    }
  } else {
    // Long sides are left and right.
    for (let i = 0; i < first; i++) {
      out.push(pos(o, i + 1, { x: o.x - SEAT_OFFSET, y: o.y + (o.height * (i + 0.5)) / first }));
    }
    for (let i = 0; i < second; i++) {
      out.push(
        pos(o, first + i + 1, { x: o.x + o.width + SEAT_OFFSET, y: o.y + (o.height * (i + 0.5)) / second }),
      );
    }
  }
  return out;
}

function rowSeats(o: RowObject): SeatPosition[] {
  const out: SeatPosition[] = [];
  for (let n = 1; n <= o.seats; n++) {
    out.push(pos(o, n, { x: o.x + (n - 1) * o.pitch, y: o.y }));
  }
  return out;
}

/** The four corners of a rectangle-shaped object (rect table or stage), rotated. */
export function rectCorners(o: { x: number; y: number; width: number; height: number; rotation: number }): Point[] {
  const a = { x: o.x, y: o.y };
  return [
    { x: o.x, y: o.y },
    { x: o.x + o.width, y: o.y },
    { x: o.x + o.width, y: o.y + o.height },
    { x: o.x, y: o.y + o.height },
  ].map((p) => rotatePoint(p, a, o.rotation));
}

function boundsOfPoints(points: Point[], pad = 0): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/** Axis-aligned bounds of an object's body plus its seat circles, after rotation. */
export function objectBounds(o: ChartObject): Bounds {
  switch (o.kind) {
    case 'round': {
      const reach = o.seats > 0 ? o.radius + SEAT_OFFSET + SEAT_RADIUS : o.radius;
      return { minX: o.x - reach, minY: o.y - reach, maxX: o.x + reach, maxY: o.y + reach };
    }
    case 'stage':
      return boundsOfPoints(rectCorners(o));
    case 'rect': {
      const body = boundsOfPoints(rectCorners(o));
      const seats = seatPositions(o);
      return seats.length ? unionBounds(body, boundsOfPoints(seats, SEAT_RADIUS)) : body;
    }
    case 'row':
      return boundsOfPoints(seatPositions(o), SEAT_RADIUS);
  }
}

/** Union of all object bounds; the canvas itself when the layout is empty. */
export function layoutBounds(layout: Pick<SeatingChart, 'objects' | 'canvas'>): Bounds {
  if (layout.objects.length === 0) {
    return { minX: 0, minY: 0, maxX: layout.canvas.width, maxY: layout.canvas.height };
  }
  return layout.objects.map(objectBounds).reduce(unionBounds);
}

/** Centre of an object's body (label anchor). */
export function objectCenter(o: ChartObject): Point {
  switch (o.kind) {
    case 'round':
      return { x: o.x, y: o.y };
    case 'stage':
    case 'rect':
      return rotatePoint({ x: o.x + o.width / 2, y: o.y + o.height / 2 }, anchorOf(o), o.rotation);
    case 'row': {
      const seats = seatPositions(o);
      const last = seats[seats.length - 1] ?? { x: o.x, y: o.y };
      return { x: (o.x + last.x) / 2, y: (o.y + last.y) / 2 };
    }
  }
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Does `p` fall on this object's body or one of its seats? */
export function objectContains(o: ChartObject, p: Point): boolean {
  switch (o.kind) {
    case 'round': {
      const reach = o.seats > 0 ? o.radius + SEAT_OFFSET + SEAT_RADIUS : o.radius;
      return dist2(p, o) <= reach * reach;
    }
    case 'stage':
    case 'rect': {
      // Un-rotate the point into the object's frame and test the body rect.
      const local = rotatePoint(p, anchorOf(o), -o.rotation);
      const inBody =
        local.x >= o.x && local.x <= o.x + o.width && local.y >= o.y && local.y <= o.y + o.height;
      if (inBody || o.kind === 'stage') return inBody;
      return seatPositions(o).some((s) => dist2(p, s) <= SEAT_RADIUS * SEAT_RADIUS);
    }
    case 'row': {
      const local = rotatePoint(p, anchorOf(o), -o.rotation);
      const half = Math.max(o.pitch / 2, SEAT_RADIUS);
      const inBand =
        local.x >= o.x - half &&
        local.x <= o.x + (o.seats - 1) * o.pitch + half &&
        Math.abs(local.y - o.y) <= SEAT_RADIUS + 4;
      return inBand;
    }
  }
}

/** Topmost object under `p` (objects later in the array are drawn on top), or null. */
export function hitTest(layout: Pick<ChartDraft, 'objects'>, p: Point): ChartObject | null {
  for (let i = layout.objects.length - 1; i >= 0; i--) {
    const o = layout.objects[i];
    if (objectContains(o, p)) return o;
  }
  return null;
}

/** The seat under `p`, if any (seat circles win over table bodies). */
export function hitTestSeat(layout: Pick<ChartDraft, 'objects'>, p: Point): SeatPosition | null {
  for (let i = layout.objects.length - 1; i >= 0; i--) {
    for (const s of seatPositions(layout.objects[i])) {
      if (dist2(p, s) <= SEAT_RADIUS * SEAT_RADIUS) return s;
    }
  }
  return null;
}

/** Every seat in the layout, in object order then seat order. */
export function allSeats(layout: Pick<ChartDraft, 'objects'>): SeatPosition[] {
  return layout.objects.flatMap(seatPositions);
}
