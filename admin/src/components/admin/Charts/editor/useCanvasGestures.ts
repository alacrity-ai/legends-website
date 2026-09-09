/**
 * Pointer events on the SVG → editor intents. One hook, one state machine:
 *
 *   1 pointer on an object   → select, then drag (after 8 px); 450 ms hold → add to selection
 *   1 pointer on a handle    → rotate / resize
 *   1 mouse on empty canvas  → marquee select
 *   1 touch on empty canvas  → pan
 *   2 pointers               → pinch zoom + pan
 *   wheel                    → zoom about the cursor
 *
 * Every coordinate goes through `getScreenCTM().inverse()`. `pointerleave`
 * and `pointercancel` never cancel a tap.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { ChartObject } from '@seating/types.ts';
import { SEAT_OFFSET, SEAT_RADIUS, hitTest, objectBounds, objectCenter, rotatePoint, type Point } from '@seating/geometry.ts';
import { clientToCanvas, effectiveScale, panViewBox, zoomViewBox, type ViewBox } from '@seating/view.ts';
import { GRID, ROTATION_SNAP, snap, type EditorAction, type EditorState } from './useEditorState.ts';

const DRAG_SLOP_PX = 8;
const LONG_PRESS_MS = 450;

export type HandleKind = 'rotate' | 'nw' | 'ne' | 'se' | 'sw' | 'radius';

export interface Marquee {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Gesture =
  | { type: 'maybeDrag'; objectId: string; ids: string[]; startClient: Point; startCanvas: Point; origins: Record<string, Point>; longPressed: boolean; additive: boolean }
  | { type: 'drag'; ids: string[]; startCanvas: Point; origins: Record<string, Point> }
  | { type: 'rotate'; id: string; center: Point }
  | { type: 'resize'; id: string; handle: HandleKind; orig: ChartObject }
  | { type: 'pan'; startClient: Point; startVb: ViewBox; moved: boolean }
  | { type: 'marquee'; startCanvas: Point }
  | { type: 'pinch'; startDist: number; startVb: ViewBox; startMidClient: Point; startMidCanvas: Point };

interface Options {
  svgRef: RefObject<SVGSVGElement | null>;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  viewBox: ViewBox;
  setViewBox: (vb: ViewBox) => void;
}

export function useCanvasGestures({ svgRef, state, dispatch, viewBox, setViewBox }: Options) {
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const longPress = useRef<number | null>(null);
  const [marquee, setMarqueeState] = useState<Marquee | null>(null);
  const marqueeRef = useRef<Marquee | null>(null);
  const setMarquee = useCallback((m: Marquee | null) => {
    marqueeRef.current = m;
    setMarqueeState(m);
  }, []);

  // Latest state/viewBox for handlers without re-binding them every render.
  const latest = useRef({ state, viewBox });
  useEffect(() => {
    latest.current = { state, viewBox };
  });

  const clearLongPress = () => {
    if (longPress.current !== null) {
      window.clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  const toCanvas = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      return svg ? clientToCanvas(svg, clientX, clientY) : { x: clientX, y: clientY };
    },
    [svgRef],
  );

  const pxScale = useCallback(
    (vb: ViewBox): number => {
      const svg = svgRef.current;
      if (!svg) return 1;
      const r = svg.getBoundingClientRect();
      return effectiveScale(r.width, r.height, vb);
    },
    [svgRef],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const svg = e.currentTarget;
      svg.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const { state: s, viewBox: vb } = latest.current;

      if (pointers.current.size === 2) {
        clearLongPress();
        const [a, b] = [...pointers.current.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        gesture.current = {
          type: 'pinch',
          startDist: Math.hypot(a.x - b.x, a.y - b.y),
          startVb: vb,
          startMidClient: mid,
          startMidCanvas: toCanvas(mid.x, mid.y),
        };
        setMarquee(null);
        return;
      }
      if (pointers.current.size > 2) return;

      const p = toCanvas(e.clientX, e.clientY);
      const target = e.target as Element;
      const handleEl = target.closest?.('[data-handle]') as SVGElement | null;
      if (handleEl) {
        const handle = handleEl.getAttribute('data-handle') as HandleKind;
        const id = handleEl.getAttribute('data-object-id') ?? '';
        const o = s.layout.objects.find((x) => x.id === id);
        if (!o) return;
        dispatch({ type: 'checkpoint' });
        gesture.current = handle === 'rotate' ? { type: 'rotate', id, center: objectCenter(o) } : { type: 'resize', id, handle, orig: o };
        return;
      }

      const hit = hitTest(s.layout, p);
      if (hit) {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        let ids: string[];
        if (additive) {
          ids = s.selection.includes(hit.id) ? s.selection.filter((x) => x !== hit.id) : [...s.selection, hit.id];
          dispatch({ type: 'select', ids });
        } else if (s.selection.includes(hit.id)) {
          ids = s.selection;
        } else {
          ids = [hit.id];
          dispatch({ type: 'select', ids });
        }
        const origins: Record<string, Point> = {};
        for (const o of s.layout.objects) if (ids.includes(o.id)) origins[o.id] = { x: o.x, y: o.y };
        const g: Gesture = {
          type: 'maybeDrag',
          objectId: hit.id,
          ids,
          startClient: { x: e.clientX, y: e.clientY },
          startCanvas: p,
          origins,
          longPressed: false,
          additive,
        };
        gesture.current = g;
        if (e.pointerType !== 'mouse') {
          clearLongPress();
          longPress.current = window.setTimeout(() => {
            if (gesture.current === g) {
              g.longPressed = true;
              dispatch({ type: 'toggleSelect', id: hit.id });
              if (navigator.vibrate) navigator.vibrate(10);
            }
          }, LONG_PRESS_MS);
        }
        return;
      }

      if (e.pointerType === 'mouse') {
        gesture.current = { type: 'marquee', startCanvas: p };
        setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
      } else {
        gesture.current = { type: 'pan', startClient: { x: e.clientX, y: e.clientY }, startVb: vb, moved: false };
      }
    },
    [dispatch, setMarquee, toCanvas],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (!g) return;

      switch (g.type) {
        case 'pinch': {
          if (pointers.current.size < 2) return;
          const [a, b] = [...pointers.current.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          let vb = zoomViewBox(g.startVb, g.startDist / dist, g.startMidCanvas);
          const k = pxScale(vb);
          vb = panViewBox(vb, (mid.x - g.startMidClient.x) / k, (mid.y - g.startMidClient.y) / k);
          setViewBox(vb);
          return;
        }
        case 'maybeDrag': {
          const moved = Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y);
          if (moved < DRAG_SLOP_PX || g.longPressed) return;
          clearLongPress();
          dispatch({ type: 'checkpoint' });
          gesture.current = { type: 'drag', ids: g.ids, startCanvas: g.startCanvas, origins: g.origins };
          return;
        }
        case 'drag': {
          const p = toCanvas(e.clientX, e.clientY);
          dispatch({ type: 'moveLive', origins: g.origins, dx: p.x - g.startCanvas.x, dy: p.y - g.startCanvas.y });
          return;
        }
        case 'rotate': {
          const p = toCanvas(e.clientX, e.clientY);
          const deg = (Math.atan2(p.y - g.center.y, p.x - g.center.x) * 180) / Math.PI + 90;
          dispatch({ type: 'rotateLive', id: g.id, rotation: snap(deg, ROTATION_SNAP) });
          return;
        }
        case 'resize': {
          const p = toCanvas(e.clientX, e.clientY);
          dispatch({ type: 'patchLive', id: g.id, patch: resizePatch(g.orig, g.handle, p) });
          return;
        }
        case 'pan': {
          const k = pxScale(g.startVb);
          const dx = (e.clientX - g.startClient.x) / k;
          const dy = (e.clientY - g.startClient.y) / k;
          if (Math.hypot(e.clientX - g.startClient.x, e.clientY - g.startClient.y) > DRAG_SLOP_PX) g.moved = true;
          setViewBox(panViewBox(g.startVb, dx, dy));
          return;
        }
        case 'marquee': {
          const p = toCanvas(e.clientX, e.clientY);
          setMarquee({
            x: Math.min(p.x, g.startCanvas.x),
            y: Math.min(p.y, g.startCanvas.y),
            w: Math.abs(p.x - g.startCanvas.x),
            h: Math.abs(p.y - g.startCanvas.y),
          });
          return;
        }
      }
    },
    [dispatch, pxScale, setMarquee, setViewBox, toCanvas],
  );

  const endPointer = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>, cancelled: boolean) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.delete(e.pointerId);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // already released
      }
      clearLongPress();
      const g = gesture.current;
      if (!g) return;
      const { state: s } = latest.current;

      if (g.type === 'pinch') {
        if (pointers.current.size < 2) gesture.current = null;
        return;
      }
      gesture.current = null;

      if (cancelled) {
        setMarquee(null);
        return;
      }

      switch (g.type) {
        case 'maybeDrag':
          // A plain tap already selected on pointerdown; nothing more to do.
          return;
        case 'pan':
          if (!g.moved) dispatch({ type: 'clearSelection' });
          return;
        case 'marquee': {
          const m = marqueeRef.current;
          setMarquee(null);
          if (!m || (m.w < 2 && m.h < 2)) {
            dispatch({ type: 'clearSelection' });
            return;
          }
          const ids = s.layout.objects
            .filter((o) => {
              const b = objectBounds(o);
              return b.maxX >= m.x && b.minX <= m.x + m.w && b.maxY >= m.y && b.minY <= m.y + m.h;
            })
            .map((o) => o.id);
          dispatch({ type: 'select', ids });
          return;
        }
        default:
          return;
      }
    },
    [dispatch, setMarquee],
  );

  const onPointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => endPointer(e, false), [endPointer]);
  const onPointerCancel = useCallback((e: ReactPointerEvent<SVGSVGElement>) => endPointer(e, true), [endPointer]);

  // Wheel zoom needs a non-passive listener (React registers wheel as passive).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const at = clientToCanvas(svg, e.clientX, e.clientY);
      const factor = Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0018);
      setViewBox(zoomViewBox(latest.current.viewBox, factor, at));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef, setViewBox]);

  useEffect(() => clearLongPress, []);

  return {
    svgProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    marquee,
  };
}

/** New geometry for a corner / radius handle dragged to canvas point `p`. */
function resizePatch(orig: ChartObject, handle: HandleKind, p: Point): Partial<ChartObject> {
  if (orig.kind === 'round') {
    const r = snap(Math.hypot(p.x - orig.x, p.y - orig.y) - SEAT_OFFSET - SEAT_RADIUS, 10);
    return { radius: Math.max(20, Math.min(200, r)) };
  }
  if (orig.kind !== 'rect' && orig.kind !== 'stage') return {};
  const anchor = { x: orig.x, y: orig.y };
  const local = rotatePoint(p, anchor, -orig.rotation);
  // Fixed opposite corner in local space.
  let left = orig.x;
  let top = orig.y;
  let right = orig.x + orig.width;
  let bottom = orig.y + orig.height;
  if (handle === 'se') {
    right = local.x;
    bottom = local.y;
  } else if (handle === 'ne') {
    right = local.x;
    top = local.y;
  } else if (handle === 'sw') {
    left = local.x;
    bottom = local.y;
  } else if (handle === 'nw') {
    left = local.x;
    top = local.y;
  }
  const max = orig.kind === 'stage' ? 2000 : 800;
  const width = Math.max(GRID, Math.min(max, snap(right - left)));
  const height = Math.max(GRID, Math.min(max, snap(bottom - top)));
  // Recompute left/top from the fixed corner so the snap doesn't drift it.
  const fixedX = handle === 'se' || handle === 'ne' ? orig.x : orig.x + orig.width;
  const fixedY = handle === 'se' || handle === 'sw' ? orig.y : orig.y + orig.height;
  const newLeft = handle === 'se' || handle === 'ne' ? fixedX : fixedX - width;
  const newTop = handle === 'se' || handle === 'sw' ? fixedY : fixedY - height;
  // The anchor moved in local space; map it back to world space.
  const world = rotatePoint({ x: newLeft, y: newTop }, anchor, orig.rotation);
  return { x: world.x, y: world.y, width, height };
}
