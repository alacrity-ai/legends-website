/**
 * The four object chips. Tapping drops the object at the centre of the
 * current view (one tap beats drag-from-palette on a phone); on a laptop
 * the chips can also be dragged onto the canvas.
 */
import type { DragEvent } from 'react';
import type { ObjectKind } from '@seating/types.ts';
import styles from '../ChartEditor.module.css';

interface PaletteProps {
  hasStage: boolean;
  onAdd: (kind: ObjectKind) => void;
}

export const PALETTE_DRAG_TYPE = 'application/x-legends-seating-kind';

const CHIPS: { kind: ObjectKind; label: string; glyph: string }[] = [
  { kind: 'round', label: 'Round table', glyph: '◯' },
  { kind: 'rect', label: 'Rect table', glyph: '▭' },
  { kind: 'row', label: 'Seat row', glyph: '∷' },
  { kind: 'stage', label: 'Stage', glyph: '▬' },
];

export default function Palette({ hasStage, onAdd }: PaletteProps) {
  const onDragStart = (e: DragEvent<HTMLButtonElement>, kind: ObjectKind) => {
    e.dataTransfer.setData(PALETTE_DRAG_TYPE, kind);
    e.dataTransfer.effectAllowed = 'copy';
  };
  return (
    <div className={styles.palette} role="toolbar" aria-label="Add objects">
      {CHIPS.map(({ kind, label, glyph }) => {
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
            <span className={styles.chipGlyph} aria-hidden="true">
              {glyph}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
