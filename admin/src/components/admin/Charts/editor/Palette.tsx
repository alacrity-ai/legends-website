/**
 * The four object chips. Tapping drops the object at the centre of the
 * current view (one tap beats drag-from-palette on a phone); on a laptop
 * the chips can also be dragged onto the canvas. A 4-up grid on phones,
 * inline pills from 900 px (CSS).
 */
import type { DragEvent, ReactNode } from 'react';
import type { ObjectKind } from '@seating/types.ts';
import styles from '../ChartEditor.module.css';

interface PaletteProps {
  hasStage: boolean;
  onAdd: (kind: ObjectKind) => void;
}

export const PALETTE_DRAG_TYPE = 'application/x-legends-seating-kind';

/** Tiny top-down glyphs drawn the way the canvas draws them. */
const ICONS: Record<ObjectKind, ReactNode> = {
  round: (
    <svg viewBox="0 0 28 18" className={styles.chipGlyph} aria-hidden="true">
      <circle cx="14" cy="9" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle
          key={a}
          cx={14 + 7.5 * Math.cos((a * Math.PI) / 180)}
          cy={9 + 7.5 * Math.sin((a * Math.PI) / 180)}
          r="1.6"
          fill="currentColor"
        />
      ))}
    </svg>
  ),
  rect: (
    <svg viewBox="0 0 28 18" className={styles.chipGlyph} aria-hidden="true">
      <rect x="6" y="5.5" width="16" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {[9, 14, 19].map((x) => (
        <g key={x}>
          <circle cx={x} cy="2.2" r="1.5" fill="currentColor" />
          <circle cx={x} cy="15.8" r="1.5" fill="currentColor" />
        </g>
      ))}
    </svg>
  ),
  row: (
    <svg viewBox="0 0 28 18" className={styles.chipGlyph} aria-hidden="true">
      <line x1="2" y1="9" x2="26" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      {[4, 9, 14, 19, 24].map((x) => (
        <circle key={x} cx={x} cy="9" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      ))}
    </svg>
  ),
  stage: (
    <svg viewBox="0 0 28 18" className={styles.chipGlyph} aria-hidden="true">
      <rect x="2" y="5" width="24" height="8" rx="2" fill="currentColor" opacity="0.18" />
      <rect x="2" y="5" width="24" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
};

const CHIPS: { kind: ObjectKind; label: string }[] = [
  { kind: 'round', label: 'Round table' },
  { kind: 'rect', label: 'Rect table' },
  { kind: 'row', label: 'Seat row' },
  { kind: 'stage', label: 'Stage' },
];

export default function Palette({ hasStage, onAdd }: PaletteProps) {
  const onDragStart = (e: DragEvent<HTMLButtonElement>, kind: ObjectKind) => {
    e.dataTransfer.setData(PALETTE_DRAG_TYPE, kind);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div className={styles.palette} role="toolbar" aria-label="Add objects">
      {CHIPS.map(({ kind, label }) => {
        const disabled = kind === 'stage' && hasStage;
        return (
          <button
            key={kind}
            type="button"
            className={styles.chip}
            onClick={() => onAdd(kind)}
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(e) => onDragStart(e, kind)}
            title={disabled ? 'This chart already has a stage' : `Add a ${label.toLowerCase()}`}
          >
            {ICONS[kind]}
            {label}
          </button>
        );
      })}
    </div>
  );
}
