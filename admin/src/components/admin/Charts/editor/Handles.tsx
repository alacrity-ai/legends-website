/**
 * Selection handles drawn inside the SeatMap SVG (edit mode): a rotate
 * handle above the object, corner handles on rectangles / the stage, a
 * radius handle on round tables. Sized in screen pixels via `scale`.
 */
import type { ChartObject } from '@seating/types.ts';
import { SEAT_OFFSET, SEAT_RADIUS, objectCenter, rectCorners, rotatePoint } from '@seating/geometry.ts';
import mapStyles from '@seating/SeatMap.module.css';
import type { Marquee } from './useCanvasGestures.ts';

interface HandlesProps {
  objects: ChartObject[];
  selection: string[];
  scale: number;
  marquee: Marquee | null;
}

export default function Handles({ objects, selection, scale, marquee }: HandlesProps) {
  const r = 11 / Math.max(scale, 0.05);
  const only = selection.length === 1 ? objects.find((o) => o.id === selection[0]) : undefined;

  return (
    <>
      {only && <ObjectHandles o={only} r={r} />}
      {marquee && (
        <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} className={mapStyles.marquee} />
      )}
    </>
  );
}

/** Angle (radians) halfway between seat 1 and seat 2 — a gap on the ring, never on a seat. */
function radiusHandleAngle(o: Extract<ChartObject, { kind: 'round' }>): number {
  const stepDeg = o.seats > 0 ? 360 / o.seats : 90;
  return ((o.rotation - 90 + stepDeg / 2) * Math.PI) / 180;
}

function ObjectHandles({ o, r }: { o: ChartObject; r: number }) {
  const c = objectCenter(o);
  const anchor = { x: o.x, y: o.y };
  const stemLen = r * 3;

  // Rotate handle: above the object's top edge, in its own frame.
  let top: { x: number; y: number };
  if (o.kind === 'round') {
    top = { x: o.x, y: o.y - o.radius - SEAT_OFFSET - SEAT_RADIUS - stemLen };
  } else if (o.kind === 'row') {
    const len = (o.seats - 1) * o.pitch;
    top = rotatePoint({ x: o.x + len / 2, y: o.y - SEAT_RADIUS - stemLen }, anchor, o.rotation);
  } else {
    const side = o.kind === 'rect' ? SEAT_OFFSET + SEAT_RADIUS : 0;
    top = rotatePoint({ x: o.x + o.width / 2, y: o.y - side - stemLen }, anchor, o.rotation);
  }
  const stemFrom =
    o.kind === 'round'
      ? { x: o.x, y: o.y - o.radius }
      : o.kind === 'row'
        ? c
        : rotatePoint({ x: o.x + o.width / 2, y: o.y }, anchor, o.rotation);

  return (
    <g data-handles-for={o.id}>
      <line x1={stemFrom.x} y1={stemFrom.y} x2={top.x} y2={top.y} className={mapStyles.handleStem} />
      <circle
        cx={top.x}
        cy={top.y}
        r={r}
        className={`${mapStyles.handle} ${mapStyles.handleRotate}`}
        data-handle="rotate"
        data-object-id={o.id}
      />
      <text
        x={top.x}
        y={top.y}
        fontSize={r * 1.3}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#ffe08a"
        pointerEvents="none"
      >
        ↻
      </text>

      {(o.kind === 'rect' || o.kind === 'stage') &&
        rectCorners(o).map((p, i) => {
          const name = (['nw', 'ne', 'se', 'sw'] as const)[i];
          return (
            <rect
              key={name}
              x={p.x - r * 0.8}
              y={p.y - r * 0.8}
              width={r * 1.6}
              height={r * 1.6}
              className={mapStyles.handle}
              data-handle={name}
              data-object-id={o.id}
            />
          );
        })}

      {o.kind === 'round' && (
        <circle
          cx={o.x + (o.radius + SEAT_OFFSET + SEAT_RADIUS + r) * Math.cos(radiusHandleAngle(o))}
          cy={o.y + (o.radius + SEAT_OFFSET + SEAT_RADIUS + r) * Math.sin(radiusHandleAngle(o))}
          r={r * 0.9}
          className={mapStyles.handle}
          data-handle="radius"
          data-object-id={o.id}
          style={{ cursor: 'ew-resize' }}
        />
      )}
    </g>
  );
}
