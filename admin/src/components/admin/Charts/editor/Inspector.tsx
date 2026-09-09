/**
 * Fields for the selection: label, seats (live re-layout), rotation, size,
 * duplicate, delete. Bottom sheet on a phone, right rail on a laptop (CSS).
 * With nothing selected it shows the chart summary and canvas size.
 */
import { useState, type Dispatch } from 'react';
import type { ChartDraft, ChartObject } from '@seating/types.ts';
import { LABEL_RE } from '@seating/ids.ts';
import { seatCount } from '@seating/geometry.ts';
import { LIMITS } from '@seating/validate.ts';
import type { EditorAction } from './useEditorState.ts';
import styles from '../ChartEditor.module.css';

interface InspectorProps {
  layout: ChartDraft;
  selection: string[];
  dispatch: Dispatch<EditorAction>;
  errors: string[];
}

export default function Inspector({ layout, selection, dispatch, errors }: InspectorProps) {
  const selected = layout.objects.filter((o) => selection.includes(o.id));
  const only = selected.length === 1 ? selected[0] : null;

  return (
    <aside className={styles.inspector} aria-label="Inspector">
      {errors.length > 0 && (
        <ul className={styles.errorList}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {only ? (
        <ObjectFields o={only} dispatch={dispatch} />
      ) : selected.length > 1 ? (
        <>
          <div className={styles.inspectorHead}>
            <span className={styles.inspectorTitle}>{selected.length} objects selected</span>
          </div>
          <div className={styles.inspectorActions}>
            <button type="button" className={styles.btnGhost} onClick={() => dispatch({ type: 'duplicate', ids: selection })}>
              Duplicate
            </button>
            <button type="button" className={styles.btnDanger} onClick={() => dispatch({ type: 'remove', ids: selection })}>
              Delete
            </button>
          </div>
        </>
      ) : (
        <ChartFields layout={layout} dispatch={dispatch} />
      )}
    </aside>
  );
}

function kindName(o: ChartObject): string {
  return o.kind === 'round' ? 'Round table' : o.kind === 'rect' ? 'Rect table' : o.kind === 'row' ? 'Seat row' : 'Stage';
}

function ObjectFields({ o, dispatch }: { o: ChartObject; dispatch: Dispatch<EditorAction> }) {
  const set = (patch: Partial<ChartObject>) => dispatch({ type: 'setField', id: o.id, patch });
  const labelError = LABEL_RE.test(o.label) ? null : 'Labels are 1–12 letters, numbers, spaces or dashes.';

  return (
    <>
      <div className={styles.inspectorHead}>
        <span className={styles.inspectorTitle}>{o.label || kindName(o)}</span>
        <span className={styles.inspectorMeta}>
          {kindName(o)}
          {o.kind !== 'stage' && ` · ${o.seats} seat${o.seats === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Label</span>
          <input
            className={`${styles.input} ${labelError ? styles.inputError : ''}`}
            value={o.label}
            maxLength={12}
            onChange={(e) => set({ label: e.target.value })}
            aria-invalid={!!labelError}
          />
          {labelError && <span className={styles.fieldError}>{labelError}</span>}
        </label>

        {o.kind !== 'stage' && (
          <Stepper
            label="Seats"
            value={o.seats}
            min={LIMITS[o.kind].seats[0]}
            max={LIMITS[o.kind].seats[1]}
            onChange={(seats) => set({ seats })}
          />
        )}

        <Stepper label="Rotation" value={o.rotation} min={0} max={345} step={15} wrap unit="°" onChange={(rotation) => set({ rotation })} />

        {o.kind === 'round' && (
          <Stepper label="Radius" value={o.radius} min={LIMITS.round.radius[0]} max={LIMITS.round.radius[1]} step={10} onChange={(radius) => set({ radius })} />
        )}
        {(o.kind === 'rect' || o.kind === 'stage') && (
          <div className={styles.fieldRow}>
            <Stepper label="Width" value={o.width} min={20} max={o.kind === 'stage' ? LIMITS.stage.side[1] : LIMITS.rect.side[1]} step={20} onChange={(width) => set({ width })} />
            <Stepper label="Height" value={o.height} min={20} max={o.kind === 'stage' ? LIMITS.stage.side[1] : LIMITS.rect.side[1]} step={20} onChange={(height) => set({ height })} />
          </div>
        )}
        {o.kind === 'row' && (
          <Stepper label="Spacing" value={o.pitch} min={LIMITS.row.pitch[0]} max={LIMITS.row.pitch[1]} step={5} onChange={(pitch) => set({ pitch })} />
        )}
      </div>

      <div className={styles.inspectorActions}>
        {o.kind !== 'stage' && (
          <button type="button" className={styles.btnGhost} onClick={() => dispatch({ type: 'duplicate', ids: [o.id] })}>
            Duplicate
          </button>
        )}
        <button type="button" className={styles.btnDanger} onClick={() => dispatch({ type: 'remove', ids: [o.id] })}>
          Delete
        </button>
      </div>
    </>
  );
}

function ChartFields({ layout, dispatch }: { layout: ChartDraft; dispatch: Dispatch<EditorAction> }) {
  const counts = { round: 0, rect: 0, row: 0, stage: 0 };
  for (const o of layout.objects) counts[o.kind]++;
  return (
    <>
      <div className={styles.inspectorHead}>
        <span className={styles.inspectorTitle}>Chart</span>
        <span className={styles.inspectorMeta}>
          {layout.objects.length === 0
            ? 'Tap a chip above to add a table'
            : `${counts.round} round · ${counts.rect} rect · ${counts.row} row${counts.row === 1 ? '' : 's'}${counts.stage ? ' · stage' : ''} · ${seatCount(layout)} seats`}
        </span>
      </div>
      <div className={styles.fieldRow}>
        <Stepper
          label="Canvas width"
          value={layout.canvas.width}
          min={LIMITS.canvas.min}
          max={LIMITS.canvas.max}
          step={100}
          onChange={(width) => dispatch({ type: 'setCanvas', canvas: { ...layout.canvas, width } })}
        />
        <Stepper
          label="Canvas height"
          value={layout.canvas.height}
          min={LIMITS.canvas.min}
          max={LIMITS.canvas.max}
          step={100}
          onChange={(height) => dispatch({ type: 'setCanvas', canvas: { ...layout.canvas, height } })}
        />
      </div>
      <p className={styles.hint}>
        Tap an object to select it. Drag to move, use the ↻ handle to rotate, corners to resize. Hold to add to a
        selection. Pinch to zoom.
      </p>
    </>
  );
}

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  wrap?: boolean;
  unit?: string;
  onChange: (v: number) => void;
}

function Stepper({ label, value, min, max, step = 1, wrap = false, unit = '', onChange }: StepperProps) {
  const [text, setText] = useState(String(value));
  // Re-sync the draft text when the value changes from outside (undo, a drag on the canvas).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }

  const clamp = (v: number) => {
    if (wrap) {
      const span = max - min + step;
      return ((((v - min) % span) + span) % span) + min;
    }
    return Math.max(min, Math.min(max, v));
  };
  const commitText = () => {
    const n = Number(text);
    if (Number.isFinite(n)) onChange(clamp(Math.round(n)));
    else setText(String(value));
  };

  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.stepper}>
        <button type="button" className={styles.stepBtn} onClick={() => onChange(clamp(value - step))} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          className={styles.stepInput}
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          aria-label={label}
        />
        {unit && <span className={styles.stepUnit}>{unit}</span>}
        <button type="button" className={styles.stepBtn} onClick={() => onChange(clamp(value + step))} aria-label={`Increase ${label}`}>
          +
        </button>
      </span>
    </label>
  );
}
