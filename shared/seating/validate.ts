/**
 * Layout validation, run by the editor before Save, by the Worker on every
 * PUT/POST, and again when a layout is attached to a show. Error strings are
 * user-facing. `parseChartDraft` checks shape (throws); `validateChart`
 * checks the rules table (DESIGN §4.1) and returns every violation at once.
 */
import type { CanvasSize, ChartDraft, ChartObject, ObjectKind } from './types.ts';
import { LABEL_RE, OBJECT_ID_RE } from './ids.ts';
import { objectBounds, seatCount } from './geometry.ts';

export const LIMITS = {
  name: { min: 1, max: 60 },
  canvas: { min: 200, max: 5000 },
  objects: 80,
  seats: 400,
  round: { seats: [1, 20], radius: [20, 200] },
  rect: { seats: [1, 24], side: [20, 800] },
  row: { seats: [1, 40], pitch: [20, 120] },
  stage: { side: [20, 2000] },
} as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const KINDS: ReadonlySet<string> = new Set<ObjectKind>(['stage', 'round', 'rect', 'row']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(obj: Record<string, unknown>, field: string, where: string): number {
  const v = obj[field];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${where}: ${field} must be a number`);
  }
  return v;
}

function str(obj: Record<string, unknown>, field: string, where: string): string {
  const v = obj[field];
  if (typeof v !== 'string') throw new Error(`${where}: ${field} must be a string`);
  return v;
}

/**
 * Coerce an untrusted body into a `ChartDraft`, rejecting unknown keys and
 * wrong types. Semantic rules (ranges, uniqueness, canvas fit) are
 * `validateChart`'s job — call both.
 */
export function parseChartDraft(input: unknown): ChartDraft {
  if (!isRecord(input)) throw new Error('Chart body must be an object');
  for (const key of Object.keys(input)) {
    if (key !== 'name' && key !== 'canvas' && key !== 'objects') {
      throw new Error(`Unexpected field: ${key}`);
    }
  }
  const name = str(input, 'name', 'chart').trim();
  if (!isRecord(input.canvas)) throw new Error('canvas must be an object');
  const canvas: CanvasSize = {
    width: num(input.canvas, 'width', 'canvas'),
    height: num(input.canvas, 'height', 'canvas'),
  };
  if (!Array.isArray(input.objects)) throw new Error('objects must be an array');
  const objects = input.objects.map((raw, i) => parseObject(raw, i));
  return { name, canvas, objects };
}

const COMMON_KEYS = ['id', 'kind', 'x', 'y', 'rotation', 'label'];
const KIND_KEYS: Record<ObjectKind, string[]> = {
  stage: ['width', 'height'],
  round: ['radius', 'seats'],
  rect: ['width', 'height', 'seats'],
  row: ['seats', 'pitch'],
};

function parseObject(raw: unknown, index: number): ChartObject {
  const where = `object ${index + 1}`;
  if (!isRecord(raw)) throw new Error(`${where} is invalid`);
  const kind = raw.kind;
  if (typeof kind !== 'string' || !KINDS.has(kind)) {
    throw new Error(`${where}: kind must be stage, round, rect or row`);
  }
  const allowed = new Set([...COMMON_KEYS, ...KIND_KEYS[kind as ObjectKind]]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new Error(`${where}: unexpected field ${key}`);
  }
  const base = {
    id: str(raw, 'id', where),
    x: num(raw, 'x', where),
    y: num(raw, 'y', where),
    rotation: 'rotation' in raw ? num(raw, 'rotation', where) : 0,
    label: str(raw, 'label', where).trim(),
  };
  switch (kind as ObjectKind) {
    case 'stage':
      return { ...base, kind: 'stage', width: num(raw, 'width', where), height: num(raw, 'height', where) };
    case 'round':
      return { ...base, kind: 'round', radius: num(raw, 'radius', where), seats: num(raw, 'seats', where) };
    case 'rect':
      return {
        ...base,
        kind: 'rect',
        width: num(raw, 'width', where),
        height: num(raw, 'height', where),
        seats: num(raw, 'seats', where),
      };
    case 'row':
      return { ...base, kind: 'row', seats: num(raw, 'seats', where), pitch: num(raw, 'pitch', where) };
  }
}

function inRange(v: number, [lo, hi]: readonly [number, number]): boolean {
  return v >= lo && v <= hi;
}

function describe(o: ChartObject): string {
  const noun = o.kind === 'round' ? 'Table' : o.kind === 'rect' ? 'Table' : o.kind === 'row' ? 'Row' : 'Stage';
  return o.label ? `${noun} ${o.label}` : `${noun} (unlabelled)`;
}

/** Every rule violation in a draft, phrased for the person editing it. */
export function validateChart(draft: ChartDraft): ValidationResult {
  const errors: string[] = [];

  const name = draft.name.trim();
  if (name.length < LIMITS.name.min) errors.push('Give the chart a name.');
  if (name.length > LIMITS.name.max) errors.push(`The name must be ${LIMITS.name.max} characters or fewer.`);

  const { width, height } = draft.canvas;
  if (!inRange(width, [LIMITS.canvas.min, LIMITS.canvas.max]) || !inRange(height, [LIMITS.canvas.min, LIMITS.canvas.max])) {
    errors.push(`The canvas must be between ${LIMITS.canvas.min} and ${LIMITS.canvas.max} units on each side.`);
  }

  if (draft.objects.length > LIMITS.objects) {
    errors.push(`At most ${LIMITS.objects} objects per chart (this one has ${draft.objects.length}).`);
  }
  const total = seatCount(draft);
  if (total > LIMITS.seats) {
    errors.push(`At most ${LIMITS.seats} seats per chart (this one has ${total}).`);
  }

  const ids = new Set<string>();
  const labels = new Map<string, ChartObject>();
  let stages = 0;

  for (const o of draft.objects) {
    const who = describe(o);
    if (!OBJECT_ID_RE.test(o.id)) errors.push(`${who} has an invalid id.`);
    if (ids.has(o.id)) errors.push(`${who} shares its id with another object.`);
    ids.add(o.id);

    if (!LABEL_RE.test(o.label)) {
      errors.push(`${who}: labels are 1–12 letters, numbers, spaces or dashes.`);
    } else {
      const key = o.label.toLowerCase();
      const other = labels.get(key);
      if (other) errors.push(`${who} has the same label as ${describe(other)}.`);
      else labels.set(key, o);
    }

    if (!Number.isFinite(o.rotation)) errors.push(`${who} has an invalid rotation.`);

    switch (o.kind) {
      case 'stage':
        stages++;
        if (!inRange(o.width, LIMITS.stage.side) || !inRange(o.height, LIMITS.stage.side)) {
          errors.push(`The stage must be between ${LIMITS.stage.side[0]} and ${LIMITS.stage.side[1]} units on each side.`);
        }
        break;
      case 'round':
        if (!Number.isInteger(o.seats) || !inRange(o.seats, LIMITS.round.seats)) {
          errors.push(`${who}: round tables seat ${LIMITS.round.seats[0]}–${LIMITS.round.seats[1]}.`);
        }
        if (!inRange(o.radius, LIMITS.round.radius)) {
          errors.push(`${who}: radius must be ${LIMITS.round.radius[0]}–${LIMITS.round.radius[1]} units.`);
        }
        break;
      case 'rect':
        if (!Number.isInteger(o.seats) || !inRange(o.seats, LIMITS.rect.seats)) {
          errors.push(`${who}: rectangular tables seat ${LIMITS.rect.seats[0]}–${LIMITS.rect.seats[1]}.`);
        }
        if (!inRange(o.width, LIMITS.rect.side) || !inRange(o.height, LIMITS.rect.side)) {
          errors.push(`${who}: sides must be ${LIMITS.rect.side[0]}–${LIMITS.rect.side[1]} units.`);
        }
        break;
      case 'row':
        if (!Number.isInteger(o.seats) || !inRange(o.seats, LIMITS.row.seats)) {
          errors.push(`${who}: rows seat ${LIMITS.row.seats[0]}–${LIMITS.row.seats[1]}.`);
        }
        if (!inRange(o.pitch, LIMITS.row.pitch)) {
          errors.push(`${who}: seat spacing must be ${LIMITS.row.pitch[0]}–${LIMITS.row.pitch[1]} units.`);
        }
        break;
    }

    // Canvas fit uses the real bounds; skipped when the numbers are nonsense to avoid NaN noise.
    const b = objectBounds(o);
    if ([b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) {
      if (b.minX < 0 || b.minY < 0 || b.maxX > width || b.maxY > height) {
        errors.push(`${who} is outside the canvas.`);
      }
    }
  }

  if (stages > 1) errors.push('A chart can have only one stage.');

  return { ok: errors.length === 0, errors };
}

/** Name-only check for the inline field (same rule as `validateChart`). */
export function validateChartName(name: string): string | null {
  const n = name.trim();
  if (n.length < LIMITS.name.min) return 'Give the chart a name.';
  if (n.length > LIMITS.name.max) return `The name must be ${LIMITS.name.max} characters or fewer.`;
  return null;
}
