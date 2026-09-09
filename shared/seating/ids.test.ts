import { describe, expect, it } from 'vitest';
import {
  CHART_ID_RE,
  OBJECT_ID_RE,
  SEAT_ID_RE,
  newChartId,
  newObjectId,
  nextRowLabel,
  nextTableLabel,
  parseSeatId,
  seatId,
  seatLabel,
} from './ids.ts';

describe('ids', () => {
  it('seatId / parseSeatId round-trip and reject junk', () => {
    expect(seatId('o_2', 3)).toBe('o_2.3');
    expect(parseSeatId('o_2.3')).toEqual({ objectId: 'o_2', n: 3 });
    expect(parseSeatId('o_abcdef12.400')).toEqual({ objectId: 'o_abcdef12', n: 400 });
    expect(parseSeatId('o_2.0')).toBeNull();
    expect(parseSeatId('x_2.3')).toBeNull();
    expect(parseSeatId('o_2.3.4')).toBeNull();
    expect(parseSeatId('o_2')).toBeNull();
    expect(SEAT_ID_RE.test('o_2.1000')).toBe(false);
  });

  it('labels: tables read T1-3, rows read A3', () => {
    expect(seatLabel({ kind: 'round', label: 'T1' }, 3)).toBe('T1-3');
    expect(seatLabel({ kind: 'rect', label: 'Head' }, 1)).toBe('Head-1');
    expect(seatLabel({ kind: 'row', label: 'A' }, 12)).toBe('A12');
  });

  it('newObjectId avoids collisions and matches the pattern', () => {
    const id = newObjectId(['o_1']);
    expect(OBJECT_ID_RE.test(id)).toBe(true);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(newObjectId(seen));
    expect(seen.size).toBe(200);
  });

  it('newChartId is c_ + 8 hex', () => {
    expect(CHART_ID_RE.test(newChartId())).toBe(true);
  });

  it('nextTableLabel skips taken numbers case-insensitively', () => {
    expect(nextTableLabel([])).toBe('T1');
    expect(nextTableLabel([{ label: 'T1' }, { label: 't2' }, { label: 'A' }])).toBe('T3');
    expect(nextTableLabel([{ label: 'T2' }])).toBe('T1');
  });

  it('nextRowLabel walks A…Z then AA', () => {
    expect(nextRowLabel([])).toBe('A');
    expect(nextRowLabel([{ label: 'A' }, { label: 'b' }])).toBe('C');
    const all = Array.from({ length: 26 }, (_, i) => ({ label: String.fromCharCode(65 + i) }));
    expect(nextRowLabel(all)).toBe('AA');
  });
});
