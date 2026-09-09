/**
 * Seating-chart domain types (v0.5, LGD-12). Shared by the public site, the
 * admin PWA and the Worker via the `@seating/*` alias — one definition of a
 * layout so the three builds cannot drift.
 *
 * Coordinates are abstract canvas units (1 unit ≈ 1 cm is the mental model).
 * Rotation is degrees, clockwise, applied around the object's own anchor
 * (`x, y`): the centre for round tables, the top-left corner for rectangles
 * and the stage, the first seat's centre for rows.
 */

export type ObjectKind = 'stage' | 'round' | 'rect' | 'row';

interface BaseObject {
  /** `o_` + up to 8 [a-z0-9]; stable for the life of the layout. */
  id: string;
  kind: ObjectKind;
  x: number;
  y: number;
  rotation: number;
  /** Human label: `^[A-Za-z0-9 \-]{1,12}$`, unique within a layout. */
  label: string;
}

/** The stage: a wide rectangle, no seats, at most one per layout. */
export interface StageObject extends BaseObject {
  kind: 'stage';
  width: number;
  height: number;
}

/** A round table: `x, y` is the centre; seats sit on a ring outside the rim. */
export interface RoundObject extends BaseObject {
  kind: 'round';
  radius: number;
  seats: number;
}

/** A rectangular table: `x, y` is the top-left; seats split across the two long sides. */
export interface RectObject extends BaseObject {
  kind: 'rect';
  width: number;
  height: number;
  seats: number;
}

/** A straight row of seats: `x, y` is the first seat's centre; `pitch` is the spacing. */
export interface RowObject extends BaseObject {
  kind: 'row';
  seats: number;
  pitch: number;
}

export type ChartObject = StageObject | RoundObject | RectObject | RowObject;
export type SeatedObject = RoundObject | RectObject | RowObject;

export interface CanvasSize {
  width: number;
  height: number;
}

/** The editable part of a layout — what the editor holds and what POST/PUT carry. */
export interface ChartDraft {
  name: string;
  canvas: CanvasSize;
  objects: ChartObject[];
}

/** A stored layout (KV `EVENTS` key `chart:<id>`). */
export interface SeatingChart extends ChartDraft {
  /** `c_` + 8 hex, server-assigned. */
  id: string;
  /** Schema version of this document. */
  version: number;
  /** Bumps on every PUT; carried back by the editor for optimistic concurrency. */
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** One seat, positioned. `id` is `<objectId>.<n>` (1-based); `label` is what people see. */
export interface SeatPosition {
  id: string;
  label: string;
  objectId: string;
  n: number;
  x: number;
  y: number;
}

/** Render state of a seat, across the editor, the buyer picker and the door view. */
export type SeatState = 'available' | 'held' | 'sold' | 'checkedIn' | 'selected';

/** Axis-aligned bounding box. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Snapshot of a layout attached to a show (`event.seating`). */
export interface EventSeating {
  chartId: string;
  chartName: string;
  chartRevision: number;
  seatCount: number;
  attachedAt: string;
  layout: SeatingChart;
}

/** How completely a paid party got the seats it held. */
export type PartySeatStatus = 'assigned' | 'partial' | 'unassigned';

export const CHART_SCHEMA_VERSION = 1;
