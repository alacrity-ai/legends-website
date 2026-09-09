import { describe, expect, it } from 'vitest';
import { parseChartDraft, validateChart, validateChartName } from './validate.ts';
import type { ChartDraft, ChartObject } from './types.ts';

const good: ChartDraft = {
  name: 'Venue 1 Seating',
  canvas: { width: 1200, height: 800 },
  objects: [
    { id: 'o_1', kind: 'stage', x: 400, y: 20, width: 400, height: 80, rotation: 0, label: 'Stage' },
    { id: 'o_2', kind: 'round', x: 300, y: 300, radius: 60, seats: 8, label: 'T1', rotation: 0 },
    { id: 'o_3', kind: 'rect', x: 700, y: 300, width: 160, height: 80, seats: 6, label: 'T2', rotation: 0 },
    { id: 'o_4', kind: 'row', x: 200, y: 650, seats: 12, pitch: 40, label: 'A', rotation: 0 },
  ],
};

function withObjects(objects: ChartObject[]): ChartDraft {
  return { ...good, objects };
}

describe('validateChart', () => {
  it('accepts the design-doc example', () => {
    expect(validateChart(good)).toEqual({ ok: true, errors: [] });
  });

  it('requires a name within 1–60 chars', () => {
    expect(validateChart({ ...good, name: '  ' }).errors).toContain('Give the chart a name.');
    expect(validateChart({ ...good, name: 'x'.repeat(61) }).ok).toBe(false);
    expect(validateChartName('ok')).toBeNull();
    expect(validateChartName('')).toBe('Give the chart a name.');
  });

  it('rejects duplicate ids', () => {
    const r = validateChart(withObjects([good.objects[1], { ...good.objects[1], label: 'T5' }]));
    expect(r.errors.some((e) => e.includes('shares its id'))).toBe(true);
  });

  it('rejects duplicate labels case-insensitively with a readable message', () => {
    const r = validateChart(withObjects([good.objects[1], { ...good.objects[2], label: 't1' }]));
    expect(r.errors).toContain('Table t1 has the same label as Table T1.');
  });

  it('rejects labels outside the pattern', () => {
    const r = validateChart(withObjects([{ ...good.objects[1], label: 'T1!' }]));
    expect(r.errors[0]).toMatch(/labels are 1–12/);
    expect(validateChart(withObjects([{ ...good.objects[1], label: 'ABCDEFGHIJKLM' }])).ok).toBe(false);
  });

  it('enforces seat ranges per kind', () => {
    expect(validateChart(withObjects([{ ...good.objects[1], kind: 'round', seats: 21 } as ChartObject])).ok).toBe(false);
    expect(validateChart(withObjects([{ ...good.objects[2], kind: 'rect', seats: 0 } as ChartObject])).ok).toBe(false);
    expect(validateChart(withObjects([{ ...good.objects[3], kind: 'row', seats: 41 } as ChartObject])).ok).toBe(false);
    expect(validateChart(withObjects([{ ...good.objects[3], kind: 'row', seats: 2.5 } as ChartObject])).ok).toBe(false);
  });

  it('allows one stage only', () => {
    const r = validateChart(withObjects([good.objects[0], { ...good.objects[0], id: 'o_9', label: 'Stage 2' }]));
    expect(r.errors).toContain('A chart can have only one stage.');
  });

  it('caps objects at 80 and seats at 400', () => {
    const many: ChartObject[] = Array.from({ length: 81 }, (_, i) => ({
      id: `o_${i.toString(36)}`,
      kind: 'round',
      x: 100 + (i % 9) * 120,
      y: 100 + Math.floor(i / 9) * 120,
      radius: 20,
      seats: 1,
      label: `T${i}`,
      rotation: 0,
    }));
    expect(validateChart({ ...good, canvas: { width: 2000, height: 2000 }, objects: many }).errors).toContain(
      'At most 80 objects per chart (this one has 81).',
    );
    const rows: ChartObject[] = Array.from({ length: 11 }, (_, i) => ({
      id: `o_r${i}`,
      kind: 'row',
      x: 100,
      y: 100 + i * 60,
      seats: 40,
      pitch: 40,
      label: `R${i}`,
      rotation: 0,
    }));
    expect(validateChart({ ...good, canvas: { width: 2000, height: 2000 }, objects: rows }).errors).toContain(
      'At most 400 seats per chart (this one has 440).',
    );
  });

  it('rejects objects outside the canvas', () => {
    const r = validateChart(withObjects([{ ...good.objects[1], x: 30, y: 30 }]));
    expect(r.errors).toContain('Table T1 is outside the canvas.');
    expect(validateChart(withObjects([{ ...good.objects[3], x: 900 }])).errors).toContain('Row A is outside the canvas.');
  });

  it('rejects a canvas outside 200–5000', () => {
    expect(validateChart({ ...good, canvas: { width: 100, height: 800 }, objects: [] }).ok).toBe(false);
  });
});

describe('parseChartDraft', () => {
  it('round-trips a valid document', () => {
    expect(parseChartDraft(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it('defaults rotation to 0 and trims the name and labels', () => {
    const d = parseChartDraft({
      name: '  Hall  ',
      canvas: { width: 500, height: 500 },
      objects: [{ id: 'o_1', kind: 'round', x: 100, y: 100, radius: 30, seats: 4, label: ' T1 ' }],
    });
    expect(d.name).toBe('Hall');
    expect(d.objects[0].rotation).toBe(0);
    expect(d.objects[0].label).toBe('T1');
  });

  it('throws on unknown top-level keys, unknown object keys and bad kinds', () => {
    expect(() => parseChartDraft({ ...good, extra: 1 })).toThrow('Unexpected field: extra');
    expect(() => parseChartDraft(withObjects([{ ...good.objects[1], seats: 8, pitch: 4 } as ChartObject]))).toThrow(
      'object 1: unexpected field pitch',
    );
    expect(() => parseChartDraft(withObjects([{ ...good.objects[1], kind: 'oval' } as unknown as ChartObject]))).toThrow(
      /kind must be/,
    );
  });

  it('throws on wrong types', () => {
    expect(() => parseChartDraft({ name: 5, canvas: { width: 1, height: 1 }, objects: [] })).toThrow('name must be a string');
    expect(() => parseChartDraft({ name: 'x', canvas: { width: 'a', height: 1 }, objects: [] })).toThrow('width must be a number');
    expect(() => parseChartDraft({ name: 'x', canvas: { width: 1, height: 1 }, objects: {} })).toThrow('objects must be an array');
    expect(() => parseChartDraft([])).toThrow();
  });
});
