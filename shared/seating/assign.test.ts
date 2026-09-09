import { describe, expect, it } from 'vitest';
import { chooseSeats, describeAssignment, freeRuns, objectFits, objectNoun, seatNumbersPhrase } from './assign.ts';
import { allSeats } from './geometry.ts';
import type { ChartDraft, ChartObject, RoundObject } from './types.ts';

const stage: ChartObject = { id: 'o_s', kind: 'stage', x: 400, y: 20, width: 400, height: 80, rotation: 0, label: 'Stage' };
const t1: RoundObject = { id: 'o_1', kind: 'round', x: 300, y: 250, radius: 60, seats: 8, label: 'T1', rotation: 0 }; // near stage
const t2: RoundObject = { id: 'o_2', kind: 'round', x: 900, y: 250, radius: 60, seats: 8, label: 'T2', rotation: 0 }; // near stage, right
const t3: RoundObject = { id: 'o_3', kind: 'round', x: 300, y: 600, radius: 60, seats: 8, label: 'T3', rotation: 0 }; // far
const rowA: ChartObject = { id: 'o_a', kind: 'row', x: 200, y: 750, seats: 12, pitch: 40, label: 'A', rotation: 0 };
const layout: ChartDraft = { name: 'x', canvas: { width: 1200, height: 800 }, objects: [stage, t1, t2, t3, rowA] };

const allFree = () => new Set(allSeats(layout).map((s) => s.id));
const minus = (free: Set<string>, ...ids: string[]) => {
  for (const id of ids) free.delete(id);
  return free;
};

describe('freeRuns', () => {
  it('splits on taken seats and wraps on round tables', () => {
    const free = minus(allFree(), 'o_1.3', 'o_1.4');
    expect(freeRuns(t1, free)).toEqual([[5, 6, 7, 8, 1, 2]]);
    const free2 = minus(allFree(), 'o_1.1', 'o_1.5');
    expect(freeRuns(t1, free2)).toEqual([[2, 3, 4], [6, 7, 8]]);
  });
  it('rows do not wrap', () => {
    const free = minus(allFree(), 'o_a.6');
    expect(freeRuns(rowA as never, free)).toEqual([[1, 2, 3, 4, 5], [7, 8, 9, 10, 11, 12]]);
  });
  it('objectFits needs a run of n', () => {
    const free = minus(allFree(), 'o_1.2', 'o_1.4', 'o_1.6', 'o_1.8');
    expect(objectFits(t1, free, 1)).toBe(true);
    expect(objectFits(t1, free, 2)).toBe(false);
    expect(objectFits(stage, free, 1)).toBe(false);
  });
});

describe('chooseSeats', () => {
  it('seats the party together at the nearest-stage table when everything is free', () => {
    const a = chooseSeats(layout, allFree(), 4)!;
    expect(a.split).toBe(false);
    expect(a.objects[0].id).toBe('o_1'); // T1 and T2 are symmetric about the stage; labels break the tie
    expect(a.seatIds).toEqual(['o_1.1', 'o_1.2', 'o_1.3', 'o_1.4']);
    expect(a.seatLabels).toEqual(['T1-1', 'T1-2', 'T1-3', 'T1-4']);
  });

  it('prefers the table nearest the stage even when a far table is a tighter fit', () => {
    // T3 (far) has exactly 2 free; T1/T2 near the stage have 8 free → front table wins.
    const free = minus(allFree(), 'o_3.1', 'o_3.2', 'o_3.3', 'o_3.4', 'o_3.5', 'o_3.6');
    const a = chooseSeats(layout, free, 2)!;
    expect(a.objects[0].id).toBe('o_1');
  });

  it('avoids stranding a single seat when another table avoids it', () => {
    // T1 (front) has 3 free → a party of 2 would strand one seat; T2 (front) has 4 free → no strand.
    const free = minus(allFree(), 'o_1.1', 'o_1.2', 'o_1.3', 'o_1.4', 'o_1.5', 'o_2.1', 'o_2.2', 'o_2.3', 'o_2.4');
    const a = chooseSeats(layout, free, 2)!;
    expect(a.objects[0].id).toBe('o_2');
    // …but a strand is accepted when every fitting table would strand one.
    const free2 = minus(allFree(), 'o_1.1', 'o_1.2', 'o_1.3', 'o_1.4', 'o_1.5', 'o_2.1', 'o_2.2', 'o_2.3', 'o_2.4', 'o_2.5', 'o_3.1', 'o_3.2', 'o_3.3', 'o_3.4', 'o_3.5', ...Array.from({ length: 9 }, (_, i) => `o_a.${i + 1}`));
    const b = chooseSeats(layout, free2, 2)!;
    expect(b.objects[0].id).toBe('o_1');
  });

  it('rows count as tables and take seats from the end so the leftover stays contiguous', () => {
    const free = minus(allFree(), ...['o_1', 'o_2', 'o_3'].flatMap((o) => Array.from({ length: 8 }, (_, i) => `${o}.${i + 1}`)));
    const a = chooseSeats(layout, free, 3)!;
    expect(a.objects[0].id).toBe('o_a');
    expect(a.seatIds).toEqual(['o_a.1', 'o_a.2', 'o_a.3']);
    expect(a.seatLabels).toEqual(['A1', 'A2', 'A3']);
  });

  it('uses the wrap-around run on a round table', () => {
    const free = minus(allFree(), 'o_1.2', 'o_1.3', 'o_1.4', 'o_1.5', 'o_1.6', 'o_2.1', 'o_2.2', 'o_2.3', 'o_2.4', 'o_2.5', 'o_2.6', 'o_3.1', 'o_3.2', 'o_3.3', 'o_3.4', 'o_3.5', 'o_3.6', ...Array.from({ length: 12 }, (_, i) => `o_a.${i + 1}`));
    // T1 has [7,8,1] (wraps), T2 [7,8], T3 [7,8]; row A full → only T1 seats 3 together.
    const a = chooseSeats(layout, free, 3)!;
    expect(a.objects[0].id).toBe('o_1');
    expect(a.seatIds).toEqual(['o_1.7', 'o_1.8', 'o_1.1']);
  });

  it('splits across the nearest tables only when nothing fits, fewest pieces', () => {
    // Every table has 4 free (seats 1–4), row A fully taken → party of 6 must split 4 + 2.
    const free = allFree();
    for (const o of ['o_1', 'o_2', 'o_3']) for (let n = 5; n <= 8; n++) free.delete(`${o}.${n}`);
    for (let n = 1; n <= 12; n++) free.delete(`o_a.${n}`);
    const a = chooseSeats(layout, free, 6)!;
    expect(a.split).toBe(true);
    expect(a.objects.map((o) => o.id)).toEqual(['o_1', 'o_3']); // T1 (near stage) then its nearest neighbour T3 (350 away) over T2 (600 away)
    expect(a.seatIds).toHaveLength(6);
  });

  it('returns null when the party cannot be seated at all, and honours objectId without splitting', () => {
    const free = new Set(['o_1.1', 'o_2.1']);
    expect(chooseSeats(layout, free, 3)).toBeNull();
    expect(chooseSeats(layout, allFree(), 2, { objectId: 'o_3' })!.objects[0].id).toBe('o_3');
    expect(chooseSeats(layout, allFree(), 9, { objectId: 'o_3' })).toBeNull();
    expect(chooseSeats(layout, allFree(), 0)).toBeNull();
  });
});

describe('copy helpers', () => {
  it('reads labels as tables and rows', () => {
    expect(objectNoun({ kind: 'round', label: 'T3' })).toBe('Table 3');
    expect(objectNoun({ kind: 'rect', label: 'Head' })).toBe('Table Head');
    expect(objectNoun({ kind: 'row', label: 'A' })).toBe('Row A');
    expect(seatNumbersPhrase([3, 4, 5])).toBe('seats 3–5');
    expect(seatNumbersPhrase([2, 4])).toBe('seats 2, 4');
    expect(seatNumbersPhrase([7])).toBe('seat 7');
  });
  it('describes single and split assignments', () => {
    expect(describeAssignment([{ id: 'o_1', label: 'T3', kind: 'round', seats: [1, 2] }])).toBe('together at Table 3');
    expect(describeAssignment([{ id: 'o_1', label: 'T3', kind: 'round', seats: [1] }, { id: 'o_2', label: 'T4', kind: 'round', seats: [1] }])).toBe('at Table 3 and Table 4, right beside each other');
  });
});
