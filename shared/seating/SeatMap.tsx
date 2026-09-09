/**
 * The one floor-plan renderer (v0.5). Used by the admin editor (`edit`),
 * the buyer's seat picker (`pick`) and the door / manage occupancy view
 * (`view`). Inline SVG, no dependencies; the viewBox is the only transform.
 *
 * - `edit`: draws selection halos + handles for the selection and leaves
 *   pointer handling to the caller (`svgProps`), which hit-tests with the
 *   shared geometry.
 * - `pick` / `view`: seats are the only interactive element; a tap
 *   (pointerup within 8 px / 400 ms of pointerdown) emits `onSeatTap`.
 *   `pointerleave` / `pointercancel` never cancel a tap — on touch they fire
 *   before `click`, and treating them as a cancel kills every real tap.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SVGProps,
} from 'react';
import type { ChartDraft, ChartObject, SeatState } from './types.ts';
import { SEAT_RADIUS, objectCenter, rotatePoint, seatPositions } from './geometry.ts';
import { effectiveScale, type ViewBox } from './view.ts';
import styles from './SeatMap.module.css';

export type SeatMapMode = 'edit' | 'pick' | 'view';

export interface SeatMapProps {
  layout: Pick<ChartDraft, 'canvas' | 'objects'>;
  mode: SeatMapMode;
  viewBox: ViewBox;
  /** Per-seat render state (pick / view). Missing seats render as `available`. */
  seatStates?: Readonly<Record<string, SeatState>>;
  /** Selected object ids (edit). */
  selection?: ReadonlySet<string>;
  /** Draw the 20-unit dot grid (edit). */
  grid?: boolean;
  /** Draw table / row / stage labels (off for thumbnails). Default true. */
  labels?: boolean;
  onSeatTap?: (seatId: string) => void;
  /** Extra SVG props — the editor's gesture handlers. */
  svgProps?: SVGProps<SVGSVGElement>;
  /** Rendered inside the SVG after everything else (handles, marquee). Receives the current CSS px per unit. */
  overlay?: (ctx: { scale: number }) => ReactNode;
  svgRef?: RefObject<SVGSVGElement | null>;
  className?: string;
}

const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 400;
const NUMBERS_AT_SCALE = 1.5;

/** Visible seat numbers only when a seat is big enough on screen to read. */
export default function SeatMap({
  layout,
  mode,
  viewBox,
  seatStates,
  selection,
  grid = false,
  labels = true,
  onSeatTap,
  svgProps,
  overlay,
  svgRef,
  className,
}: SeatMapProps) {
  const localRef = useRef<SVGSVGElement | null>(null);
  const ref = svgRef ?? localRef;
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const scale = effectiveScale(size.w, size.h, viewBox);
  const showNumbers = scale >= NUMBERS_AT_SCALE;

  // Tap detection for pick / view.
  const tapRef = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const onPointerDown = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    tapRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  }, []);
  const onPointerUp = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const t = tapRef.current;
      tapRef.current = null;
      if (!t || t.id !== e.pointerId || !onSeatTap) return;
      if (performance.now() - t.t > TAP_MAX_MS) return;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP_PX) return;
      const target = (e.target as Element | null)?.closest?.('[data-seat-id]') as SVGElement | null;
      const seatId = target?.getAttribute('data-seat-id');
      if (seatId) onSeatTap(seatId);
    },
    [onSeatTap],
  );

  useEffect(() => {
    // Guard against stale taps if a pointer never reports up (rare on iOS).
    return () => {
      tapRef.current = null;
    };
  }, []);

  const interactive = mode !== 'edit' && !!onSeatTap;
  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <svg
      ref={ref}
      viewBox={vb}
      preserveAspectRatio="xMidYMid meet"
      className={[styles.svg, styles[`mode_${mode}`], className].filter(Boolean).join(' ')}
      role={interactive ? 'group' : undefined}
      {...(interactive ? { onPointerDown, onPointerUp } : {})}
      {...svgProps}
    >
      <defs>
        <pattern id="seatmap-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.9" className={styles.gridDot} />
        </pattern>
      </defs>

      <rect
        x={0}
        y={0}
        width={layout.canvas.width}
        height={layout.canvas.height}
        className={styles.canvas}
        data-canvas="1"
      />
      {grid && (
        <rect
          x={0}
          y={0}
          width={layout.canvas.width}
          height={layout.canvas.height}
          fill="url(#seatmap-grid)"
          pointerEvents="none"
        />
      )}

      {mode === 'edit' && layout.objects.length === 0 && (
        <text
          x={layout.canvas.width / 2}
          y={layout.canvas.height / 2}
          className={styles.emptyHint}
          style={{ fontSize: readable(16, scale) }}
          textAnchor="middle"
          dominantBaseline="central"
        >
          Tap a shape above to start the floor plan
        </text>
      )}

      {layout.objects.map((o) => (
        <ObjectView
          key={o.id}
          object={o}
          mode={mode}
          selected={selection?.has(o.id) ?? false}
          seatStates={seatStates}
          showNumbers={showNumbers}
          scale={scale}
          labels={labels}
        />
      ))}

      {overlay?.({ scale })}
    </svg>
  );
}

interface ObjectViewProps {
  object: ChartObject;
  mode: SeatMapMode;
  selected: boolean;
  seatStates?: Readonly<Record<string, SeatState>>;
  showNumbers: boolean;
  /** CSS px per canvas unit — labels grow in canvas units when zoomed out so they stay legible. */
  scale: number;
  labels: boolean;
}

/** A font size in canvas units that is at least `px` on screen. */
function readable(px: number, scale: number, base = px): number {
  return Math.max(base, px / Math.max(scale, 0.01));
}

function ObjectView({ object: o, mode, selected, seatStates, showNumbers, scale, labels }: ObjectViewProps) {
  const cls = [styles.object, styles[`kind_${o.kind}`], selected ? styles.selected : ''].filter(Boolean).join(' ');
  const center = objectCenter(o);
  const labelSize = readable(12, scale, 18);

  return (
    <g className={cls} data-object-id={o.id}>
      {o.kind === 'stage' && (
        <g transform={`rotate(${o.rotation} ${o.x} ${o.y})`}>
          <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={10} className={styles.stage} />
          {labels && (
          <text
            x={o.x + o.width / 2}
            y={o.y + o.height / 2}
            className={styles.stageLabel}
            style={{ fontSize: Math.min(readable(11, scale, 22), o.height * 0.6) }}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {o.label.toUpperCase() || 'STAGE'}
          </text>
          )}
        </g>
      )}

      {o.kind === 'round' && <circle cx={o.x} cy={o.y} r={o.radius} className={styles.table} />}

      {o.kind === 'rect' && (
        <g transform={`rotate(${o.rotation} ${o.x} ${o.y})`}>
          <rect x={o.x} y={o.y} width={o.width} height={o.height} rx={8} className={styles.table} />
        </g>
      )}

      {o.kind === 'row' && <RowSpine object={o} />}

      {o.kind !== 'stage' &&
        seatPositions(o).map((s) => {
          const state = seatStates?.[s.id] ?? 'available';
          return (
            <g
              key={s.id}
              className={`${styles.seat} ${styles[`seat_${state}`]}`}
              data-seat-id={s.id}
              data-seat-label={s.label}
              data-seat-state={state}
            >
              <circle cx={s.x} cy={s.y} r={SEAT_RADIUS} className={styles.seatCircle} />
              {showNumbers && (
                <text x={s.x} y={s.y} className={styles.seatNumber} textAnchor="middle" dominantBaseline="central">
                  {s.n}
                </text>
              )}
              {mode !== 'edit' && state === 'selected' && (
                <text x={s.x} y={s.y} className={styles.seatCheck} textAnchor="middle" dominantBaseline="central">
                  ✓
                </text>
              )}
            </g>
          );
        })}

      {labels && o.kind !== 'stage' && (
        <text
          x={o.kind === 'row' ? rowLabelPoint(o).x : center.x}
          y={o.kind === 'row' ? rowLabelPoint(o).y : center.y}
          className={o.kind === 'row' ? styles.rowLabel : styles.tableLabel}
          style={{ fontSize: labelSize }}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {o.label}
        </text>
      )}
    </g>
  );
}

function rowLabelPoint(o: Extract<ChartObject, { kind: 'row' }>) {
  return rotatePoint({ x: o.x - Math.max(o.pitch, 30), y: o.y }, { x: o.x, y: o.y }, o.rotation);
}

/** A faint bar under a row so a one-seat row still reads as an object. */
function RowSpine({ object: o }: { object: Extract<ChartObject, { kind: 'row' }> }) {
  const len = (o.seats - 1) * o.pitch;
  const a = { x: o.x, y: o.y };
  const p1 = rotatePoint({ x: o.x - o.pitch / 2, y: o.y }, a, o.rotation);
  const p2 = rotatePoint({ x: o.x + len + o.pitch / 2, y: o.y }, a, o.rotation);
  return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className={styles.rowSpine} />;
}
