import { describe, expect, it } from 'vitest';
import {
  SEAT_OFFSET,
  SEAT_RADIUS,
  allSeats,
  hitTest,
  hitTestSeat,
  layoutBounds,
  objectBounds,
  objectCenter,
  rotatePoint,
  seatCount,
  seatPositions,
} from './geometry.ts';
import type { ChartObject, RectObject, RoundObject, RowObject, StageObject } from './types.ts';

const round: RoundObject = { id: 'o_r1', kind: 'round', x: 300, y: 300, radius: 60, seats: 8, label: 'T1', rotation: 0 };
const rect: RectObject = { id: 'o_q1', kind: 'rect', x: 700, y: 300, width: 160, height: 80, seats: 6, label: 'T2', rotation: 0 };
const row: RowObject = { id: 'o_w1', kind: 'row', x: 200, y: 650, seats: 12, pitch: 40, label: 'A', rotation: 0 };
const stage: StageObject = { id: 'o_s1', kind: 'stage', x: 400, y: 20, width: 400, height: 80, rotation: 0, label: 'Stage' };

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('rotatePoint', () => {
  it('rotates 90° clockwise around an anchor (y-down)', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    near(p.x, 0);
    near(p.y, 10);
  });
  it('is the identity at 0°', () => {
    expect(rotatePoint({ x: 3, y: 4 }, { x: 1, y: 1 }, 0)).toEqual({ x: 3, y: 4 });
  });
});

describe('seatPositions', () => {
  it('a stage has no seats', () => {
    expect(seatPositions(stage)).toEqual([]);
  });

  it('round: N seats on a ring outside the rim, starting at 12 o\'clock, clockwise', () => {
    const seats = seatPositions(round);
    expect(seats).toHaveLength(8);
    expect(seats.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => `o_r1.${n}`));
    expect(seats[0].label).toBe('T1-1');
    near(seats[0].x, 300);
    near(seats[0].y, 300 - (60 + SEAT_OFFSET));
    // Seat 3 (quarter turn) sits due east.
    near(seats[2].x, 300 + 60 + SEAT_OFFSET);
    near(seats[2].y, 300);
    for (const s of seats) near(Math.hypot(s.x - 300, s.y - 300), 60 + SEAT_OFFSET);
  });

  it('round: rotation moves the first seat', () => {
    const seats = seatPositions({ ...round, rotation: 90 });
    near(seats[0].x, 300 + 60 + SEAT_OFFSET);
    near(seats[0].y, 300);
  });

  it('rect (wide): splits across top and bottom, odd count → extra on top', () => {
    const seats = seatPositions({ ...rect, seats: 5 });
    expect(seats).toHaveLength(5);
    const top = seats.filter((s) => s.y < rect.y);
    const bottom = seats.filter((s) => s.y > rect.y + rect.height);
    expect(top).toHaveLength(3);
    expect(bottom).toHaveLength(2);
    expect(top.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(bottom.map((s) => s.n)).toEqual([4, 5]);
    near(top[0].y, rect.y - SEAT_OFFSET);
    near(bottom[0].y, rect.y + rect.height + SEAT_OFFSET);
  });

  it('rect (tall): uses the left and right sides', () => {
    const tall: RectObject = { ...rect, width: 80, height: 160, seats: 4 };
    const seats = seatPositions(tall);
    expect(seats.filter((s) => s.x < tall.x)).toHaveLength(2);
    expect(seats.filter((s) => s.x > tall.x + tall.width)).toHaveLength(2);
  });

  it('row: a straight line at the pitch, labels A1…A12', () => {
    const seats = seatPositions(row);
    expect(seats).toHaveLength(12);
    expect(seats[0].label).toBe('A1');
    expect(seats[11].label).toBe('A12');
    near(seats[11].x, 200 + 11 * 40);
    for (const s of seats) near(s.y, 650);
  });

  it('row: rotation 90° runs the row downward from the anchor', () => {
    const seats = seatPositions({ ...row, rotation: 90, seats: 3 });
    near(seats[0].x, 200);
    near(seats[0].y, 650);
    near(seats[2].x, 200);
    near(seats[2].y, 650 + 2 * 40);
  });
});

describe('seatCount', () => {
  it('sums every seated object and ignores the stage', () => {
    expect(seatCount({ objects: [round, rect, row, stage] })).toBe(8 + 6 + 12);
    expect(allSeats({ objects: [round, rect, row, stage] })).toHaveLength(26);
  });
});

describe('objectBounds', () => {
  it('round: reaches the outside of the seat circles', () => {
    const b = objectBounds(round);
    const reach = 60 + SEAT_OFFSET + SEAT_RADIUS;
    expect(b).toEqual({ minX: 300 - reach, minY: 300 - reach, maxX: 300 + reach, maxY: 300 + reach });
  });

  it('round: is rotation-invariant', () => {
    expect(objectBounds({ ...round, rotation: 137 })).toEqual(objectBounds(round));
  });

  it('stage: the rotated corners', () => {
    const b = objectBounds({ ...stage, rotation: 90 });
    near(b.minX, 400 - 80);
    near(b.maxX, 400);
    near(b.minY, 20);
    near(b.maxY, 20 + 400);
  });

  it('rect: includes the seat circles above and below', () => {
    const b = objectBounds(rect);
    near(b.minY, rect.y - SEAT_OFFSET - SEAT_RADIUS);
    near(b.maxY, rect.y + rect.height + SEAT_OFFSET + SEAT_RADIUS);
    near(b.minX, rect.x);
    near(b.maxX, rect.x + rect.width);
  });

  it('rect: width/height of the bounds are swapped by a 90° rotation', () => {
    const a = objectBounds(rect);
    const b = objectBounds({ ...rect, rotation: 90 });
    near(a.maxX - a.minX, b.maxY - b.minY);
    near(a.maxY - a.minY, b.maxX - b.minX);
  });

  it('layoutBounds: canvas when empty, union otherwise', () => {
    expect(layoutBounds({ objects: [], canvas: { width: 1200, height: 800 } })).toEqual({ minX: 0, minY: 0, maxX: 1200, maxY: 800 });
    const b = layoutBounds({ objects: [round, row], canvas: { width: 1200, height: 800 } });
    near(b.minX, 200 - SEAT_RADIUS);
    near(b.maxY, 650 + SEAT_RADIUS);
  });
});

describe('hit testing', () => {
  const objects: ChartObject[] = [stage, round, rect, row];

  it('finds the table under its centre and nothing in empty space', () => {
    expect(hitTest({ objects }, { x: 300, y: 300 })?.id).toBe('o_r1');
    expect(hitTest({ objects }, { x: 1100, y: 750 })).toBeNull();
  });

  it('finds a rect table body and its seat band, honouring rotation', () => {
    expect(hitTest({ objects }, { x: 780, y: 340 })?.id).toBe('o_q1');
    const rotated = { ...rect, rotation: 90 };
    // After a 90° turn about (700,300) the body occupies x∈[620,700], y∈[300,460].
    expect(hitTest({ objects: [rotated] }, { x: 660, y: 400 })?.id).toBe('o_q1');
    expect(hitTest({ objects: [rotated] }, { x: 780, y: 340 })).toBeNull();
  });

  it('the topmost (last) object wins when two overlap', () => {
    const under: RoundObject = { ...round, id: 'o_r2', label: 'T9' };
    expect(hitTest({ objects: [round, under] }, { x: 300, y: 300 })?.id).toBe('o_r2');
  });

  it('hitTestSeat returns the seat under the point', () => {
    const s = seatPositions(round)[2];
    expect(hitTestSeat({ objects }, { x: s.x + 3, y: s.y - 3 })?.id).toBe('o_r1.3');
    expect(hitTestSeat({ objects }, { x: 300, y: 300 })).toBeNull();
  });

  it('objectCenter: middle of the body', () => {
    expect(objectCenter(round)).toEqual({ x: 300, y: 300 });
    const c = objectCenter(rect);
    near(c.x, 780);
    near(c.y, 340);
    const r = objectCenter(row);
    near(r.x, 200 + (11 * 40) / 2);
  });
});
