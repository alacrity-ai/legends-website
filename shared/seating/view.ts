/**
 * ViewBox helpers for the SeatMap: the viewBox is the ONLY transform, so a
 * screen point maps to canvas units with one matrix inverse.
 */
import type { Bounds } from './types.ts';

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_VIEW_W = 120;
export const MAX_VIEW_W = 20000;

/** Screen → canvas units via the SVG's current screen CTM. */
export function clientToCanvas(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/** CSS px per canvas unit for the current element size and viewBox (`meet` scaling). */
export function effectiveScale(elementWidth: number, elementHeight: number, vb: ViewBox): number {
  if (!elementWidth || !elementHeight || !vb.w || !vb.h) return 1;
  return Math.min(elementWidth / vb.w, elementHeight / vb.h);
}

/** A viewBox that shows `bounds` (padded) and matches the element's aspect ratio. */
export function fitViewBox(bounds: Bounds, elementWidth: number, elementHeight: number, pad = 40): ViewBox {
  const bw = Math.max(bounds.maxX - bounds.minX, 1) + pad * 2;
  const bh = Math.max(bounds.maxY - bounds.minY, 1) + pad * 2;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const aspect = elementWidth && elementHeight ? elementWidth / elementHeight : 1;
  let w = bw;
  let h = bh;
  if (bw / bh > aspect) h = bw / aspect;
  else w = bh * aspect;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Zoom by `factor` keeping the canvas point `at` fixed on screen. */
export function zoomViewBox(vb: ViewBox, factor: number, at: { x: number; y: number }): ViewBox {
  const w = Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, vb.w * factor));
  const f = w / vb.w;
  const h = vb.h * f;
  return { x: at.x - (at.x - vb.x) * f, y: at.y - (at.y - vb.y) * f, w, h };
}

export function panViewBox(vb: ViewBox, dx: number, dy: number): ViewBox {
  return { ...vb, x: vb.x - dx, y: vb.y - dy };
}

export function viewCenter(vb: ViewBox): { x: number; y: number } {
  return { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
}
