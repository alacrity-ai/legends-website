/**
 * Identity rules for objects and seats. A seat's stable id is
 * `<objectId>.<n>` (1-based) — what the database and party records store.
 * Its label derives from the object's label and is what people see;
 * renaming a table changes labels, never ids.
 */
import type { ChartObject } from './types.ts';

export const OBJECT_ID_RE = /^o_[a-z0-9]{1,8}$/;
export const SEAT_ID_RE = /^o_[a-z0-9]{1,8}\.\d{1,3}$/;
export const CHART_ID_RE = /^c_[a-f0-9]{8}$/;
export const LABEL_RE = /^[A-Za-z0-9 -]{1,12}$/;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomToken(length: number): string {
  let out = '';
  // crypto is global in browsers, Workers and Node ≥ 19.
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** A fresh object id not present in `existing`. */
export function newObjectId(existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  for (;;) {
    const id = `o_${randomToken(6)}`;
    if (!taken.has(id)) return id;
  }
}

/** A fresh chart id (`c_` + 8 hex). */
export function newChartId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return 'c_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function seatId(objectId: string, n: number): string {
  return `${objectId}.${n}`;
}

export function parseSeatId(id: string): { objectId: string; n: number } | null {
  if (!SEAT_ID_RE.test(id)) return null;
  const dot = id.lastIndexOf('.');
  const n = Number(id.slice(dot + 1));
  if (!Number.isInteger(n) || n < 1) return null;
  return { objectId: id.slice(0, dot), n };
}

/** Human seat label: tables read `T1-3`, rows read `A3`. */
export function seatLabel(o: Pick<ChartObject, 'kind' | 'label'>, n: number): string {
  return o.kind === 'row' ? `${o.label}${n}` : `${o.label}-${n}`;
}

function labelsOf(objects: ReadonlyArray<Pick<ChartObject, 'label'>>): Set<string> {
  return new Set(objects.map((o) => o.label.trim().toLowerCase()));
}

/** Next free `T<n>` for a new table. */
export function nextTableLabel(objects: ReadonlyArray<Pick<ChartObject, 'label'>>): string {
  const taken = labelsOf(objects);
  for (let n = 1; ; n++) {
    const candidate = `T${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Next free `A, B, …, Z, AA, AB…` for a new row. */
export function nextRowLabel(objects: ReadonlyArray<Pick<ChartObject, 'label'>>): string {
  const taken = labelsOf(objects);
  for (let n = 0; ; n++) {
    const candidate = alphaLabel(n);
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function alphaLabel(n: number): string {
  let s = '';
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}
