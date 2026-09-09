/**
 * Editor state: the layout being edited, the selection, and an in-memory
 * undo/redo history of layout snapshots (50 deep). Gestures call
 * `checkpoint` once when they start and then `*Live` actions (no history) as
 * the pointer moves, so a drag is one undo step.
 */
import { useReducer } from 'react';
import type { CanvasSize, ChartDraft, ChartObject, ObjectKind } from '@seating/types.ts';
import { newObjectId, nextRowLabel, nextTableLabel } from '@seating/ids.ts';
import { objectBounds, objectCenter, rotatePoint, type Point } from '@seating/geometry.ts';

export const GRID = 20;
export const ROTATION_SNAP = 15;
const HISTORY_CAP = 50;

export interface EditorState {
  layout: ChartDraft;
  selection: string[];
  past: ChartDraft[];
  future: ChartDraft[];
  dirty: boolean;
}

export type EditorAction =
  | { type: 'load'; layout: ChartDraft }
  | { type: 'setName'; name: string }
  | { type: 'setCanvas'; canvas: CanvasSize }
  | { type: 'add'; kind: ObjectKind; at: Point }
  | { type: 'checkpoint' }
  | { type: 'moveLive'; origins: Record<string, Point>; dx: number; dy: number }
  | { type: 'rotateLive'; id: string; rotation: number }
  | { type: 'patchLive'; id: string; patch: Partial<ChartObject> }
  | { type: 'setField'; id: string; patch: Partial<ChartObject> }
  | { type: 'duplicate'; ids: string[] }
  | { type: 'remove'; ids: string[] }
  | { type: 'select'; ids: string[] }
  | { type: 'toggleSelect'; id: string }
  | { type: 'clearSelection' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved' };

export const EMPTY_LAYOUT: ChartDraft = { name: '', canvas: { width: 1200, height: 800 }, objects: [] };

export function snap(v: number, step = GRID): number {
  return Math.round(v / step) * step;
}

export function normalizeRotation(deg: number): number {
  const r = ((deg % 360) + 360) % 360;
  return r;
}

function withHistory(state: EditorState, layout: ChartDraft): EditorState {
  const past = [...state.past, state.layout].slice(-HISTORY_CAP);
  return { ...state, layout, past, future: [], dirty: true };
}

function patchObjects(layout: ChartDraft, fn: (o: ChartObject) => ChartObject): ChartDraft {
  return { ...layout, objects: layout.objects.map(fn) };
}

function applyPatch(o: ChartObject, patch: Partial<ChartObject>): ChartObject {
  return { ...o, ...patch } as ChartObject;
}

/** Keep an object's bounds inside the canvas by shifting it. */
function clampIntoCanvas(o: ChartObject, canvas: CanvasSize): ChartObject {
  const b = objectBounds(o);
  let dx = 0;
  let dy = 0;
  if (b.minX < 0) dx = -b.minX;
  else if (b.maxX > canvas.width) dx = canvas.width - b.maxX;
  if (b.minY < 0) dy = -b.minY;
  else if (b.maxY > canvas.height) dy = canvas.height - b.maxY;
  if (!dx && !dy) return o;
  return { ...o, x: o.x + dx, y: o.y + dy } as ChartObject;
}

export function defaultObject(kind: ObjectKind, at: Point, existing: ChartObject[]): ChartObject {
  const id = newObjectId(existing.map((o) => o.id));
  const cx = snap(at.x);
  const cy = snap(at.y);
  switch (kind) {
    case 'round':
      return { id, kind, x: cx, y: cy, radius: 60, seats: 8, label: nextTableLabel(existing), rotation: 0 };
    case 'rect':
      return { id, kind, x: cx - 80, y: cy - 40, width: 160, height: 80, seats: 6, label: nextTableLabel(existing), rotation: 0 };
    case 'row':
      return { id, kind, x: cx - 180, y: cy, seats: 10, pitch: 40, label: nextRowLabel(existing), rotation: 0 };
    case 'stage':
      return { id, kind, x: cx - 200, y: cy - 40, width: 400, height: 80, label: 'Stage', rotation: 0 };
  }
}

/**
 * Set an object's rotation while keeping its visual centre where it is.
 * Rotation is stored about the anchor (top-left / first seat), so the anchor
 * has to move for the object not to swing around its corner.
 */
export function rotateAboutCenter(o: ChartObject, rotation: number): ChartObject {
  const r = normalizeRotation(rotation);
  if (o.kind === 'round') return { ...o, rotation: r };
  const c = objectCenter(o);
  if (o.kind === 'row') {
    const len = (o.seats - 1) * o.pitch;
    const a = rotatePoint({ x: c.x - len / 2, y: c.y }, c, r);
    return { ...o, x: a.x, y: a.y, rotation: r };
  }
  const a = rotatePoint({ x: c.x - o.width / 2, y: c.y - o.height / 2 }, c, r);
  return { ...o, x: a.x, y: a.y, rotation: r };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return { layout: action.layout, selection: [], past: [], future: [], dirty: false };

    case 'setName':
      return { ...state, layout: { ...state.layout, name: action.name }, dirty: true };

    case 'setCanvas':
      return withHistory(state, { ...state.layout, canvas: action.canvas });

    case 'add': {
      const o = clampIntoCanvas(defaultObject(action.kind, action.at, state.layout.objects), state.layout.canvas);
      const next = withHistory(state, { ...state.layout, objects: [...state.layout.objects, o] });
      return { ...next, selection: [o.id] };
    }

    case 'checkpoint':
      return { ...state, past: [...state.past, state.layout].slice(-HISTORY_CAP), future: [] };

    case 'moveLive': {
      const dx = snap(action.dx);
      const dy = snap(action.dy);
      const layout = patchObjects(state.layout, (o) => {
        const origin = action.origins[o.id];
        if (!origin) return o;
        return clampIntoCanvas({ ...o, x: origin.x + dx, y: origin.y + dy } as ChartObject, state.layout.canvas);
      });
      return { ...state, layout, dirty: true };
    }

    case 'rotateLive': {
      const layout = patchObjects(state.layout, (o) =>
        o.id === action.id ? clampIntoCanvas(rotateAboutCenter(o, action.rotation), state.layout.canvas) : o,
      );
      return { ...state, layout, dirty: true };
    }

    case 'patchLive': {
      const layout = patchObjects(state.layout, (o) =>
        o.id === action.id ? clampIntoCanvas(applyPatch(o, action.patch), state.layout.canvas) : o,
      );
      return { ...state, layout, dirty: true };
    }

    case 'setField': {
      const layout = patchObjects(state.layout, (o) => {
        if (o.id !== action.id) return o;
        const next = 'rotation' in action.patch && typeof action.patch.rotation === 'number'
          ? rotateAboutCenter(applyPatch(o, { ...action.patch, rotation: o.rotation }), action.patch.rotation)
          : applyPatch(o, action.patch);
        return clampIntoCanvas(next, state.layout.canvas);
      });
      return withHistory(state, layout);
    }

    case 'duplicate': {
      const existing = [...state.layout.objects];
      const copies: ChartObject[] = [];
      for (const id of action.ids) {
        const src = state.layout.objects.find((o) => o.id === id);
        if (!src || src.kind === 'stage') continue;
        const label = src.kind === 'row' ? nextRowLabel([...existing, ...copies]) : nextTableLabel([...existing, ...copies]);
        const copy = clampIntoCanvas(
          { ...src, id: newObjectId([...existing, ...copies].map((o) => o.id)), label, x: src.x + GRID * 2, y: src.y + GRID * 2 } as ChartObject,
          state.layout.canvas,
        );
        copies.push(copy);
      }
      if (copies.length === 0) return state;
      const next = withHistory(state, { ...state.layout, objects: [...existing, ...copies] });
      return { ...next, selection: copies.map((c) => c.id) };
    }

    case 'remove': {
      const drop = new Set(action.ids);
      if (!state.layout.objects.some((o) => drop.has(o.id))) return state;
      const next = withHistory(state, { ...state.layout, objects: state.layout.objects.filter((o) => !drop.has(o.id)) });
      return { ...next, selection: state.selection.filter((id) => !drop.has(id)) };
    }

    case 'select':
      return { ...state, selection: action.ids };

    case 'toggleSelect':
      return {
        ...state,
        selection: state.selection.includes(action.id)
          ? state.selection.filter((id) => id !== action.id)
          : [...state.selection, action.id],
      };

    case 'clearSelection':
      return state.selection.length ? { ...state, selection: [] } : state;

    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      const ids = new Set(prev.objects.map((o) => o.id));
      return {
        layout: prev,
        selection: state.selection.filter((id) => ids.has(id)),
        past: state.past.slice(0, -1),
        future: [state.layout, ...state.future].slice(0, HISTORY_CAP),
        dirty: true,
      };
    }

    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      const ids = new Set(next.objects.map((o) => o.id));
      return {
        layout: next,
        selection: state.selection.filter((id) => ids.has(id)),
        past: [...state.past, state.layout].slice(-HISTORY_CAP),
        future: state.future.slice(1),
        dirty: true,
      };
    }

    case 'saved':
      return { ...state, dirty: false };
  }
}

export function useEditorState(initial: ChartDraft = EMPTY_LAYOUT) {
  return useReducer(editorReducer, initial, (layout) => ({
    layout,
    selection: [],
    past: [],
    future: [],
    dirty: false,
  }));
}
