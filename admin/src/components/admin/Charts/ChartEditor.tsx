/**
 * Seating Charts editor page: header (name, live seat count, undo/redo/fit,
 * save) → palette → SVG canvas → inspector. Full-height, phone-first.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import SeatMap from '@seating/SeatMap.tsx';
import type { ChartDraft, ObjectKind, SeatingChart } from '@seating/types.ts';
import { layoutBounds, seatCount } from '@seating/geometry.ts';
import { validateChart } from '@seating/validate.ts';
import { clientToCanvas, fitViewBox, viewCenter, type ViewBox } from '@seating/view.ts';
import { ChartApiError, createChart, getChart, updateChart } from '../../../services/charts.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import { EMPTY_LAYOUT, useEditorState } from './editor/useEditorState.ts';
import { useCanvasGestures } from './editor/useCanvasGestures.ts';
import Handles from './editor/Handles.tsx';
import Palette, { PALETTE_DRAG_TYPE } from './editor/Palette.tsx';
import Inspector from './editor/Inspector.tsx';
import styles from './ChartEditor.module.css';

interface ChartEditorProps {
  /** null = new chart */
  chartId: string | null;
  onBack: () => void;
  /** Called after a create so the URL can switch from /charts/new to /charts/:id. */
  onCreated: (chart: SeatingChart) => void;
  onUnauthorized: () => void;
}

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export default function ChartEditor({ chartId, onBack, onCreated, onUnauthorized }: ChartEditorProps) {
  const [state, dispatch] = useEditorState(EMPTY_LAYOUT);
  const [load, setLoad] = useState<Load>({ status: chartId ? 'loading' : 'ready' });
  const [meta, setMeta] = useState<{ id: string; revision: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: 1200, h: 800 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const { layout, selection, past, future, dirty } = state;

  const fit = useCallback(
    (target?: ChartDraft) => {
      const el = canvasWrapRef.current;
      const l = target ?? layout;
      const r = el?.getBoundingClientRect();
      setViewBox(fitViewBox(layoutBounds(l), r?.width ?? 390, r?.height ?? 400, 60));
    },
    [layout],
  );

  // Load an existing chart.
  const loadChart = useCallback(
    async (id: string) => {
      setLoad({ status: 'loading' });
      try {
        const chart = await getChart(id);
        dispatch({ type: 'load', layout: { name: chart.name, canvas: chart.canvas, objects: chart.objects } });
        setMeta({ id: chart.id, revision: chart.revision });
        setConflict(null);
        setLoad({ status: 'ready' });
        // Fit once the canvas has laid out.
        requestAnimationFrame(() => fit({ name: chart.name, canvas: chart.canvas, objects: chart.objects }));
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setLoad({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load chart' });
      }
    },
    [dispatch, fit, onUnauthorized],
  );

  useEffect(() => {
    if (chartId) void loadChart(chartId);
    else requestAnimationFrame(() => fit(EMPTY_LAYOUT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId]);

  // Unsaved-changes guards.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const handleBack = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes to this chart?')) return;
    onBack();
  }, [dirty, onBack]);

  // Keyboard: undo/redo, delete, escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault();
        dispatch({ type: 'remove', ids: selection });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'clearSelection' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, selection]);

  const { svgProps, marquee } = useCanvasGestures({ svgRef, state, dispatch, viewBox, setViewBox });

  const validation = useMemo(() => validateChart(layout), [layout]);
  const seats = seatCount(layout);
  const hasStage = layout.objects.some((o) => o.kind === 'stage');
  const selectionSet = useMemo(() => new Set(selection), [selection]);

  const addAtCenter = useCallback(
    (kind: ObjectKind) => dispatch({ type: 'add', kind, at: viewCenter(viewBox) }),
    [dispatch, viewBox],
  );

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDrop = (e: DragEvent) => {
    const kind = e.dataTransfer.getData(PALETTE_DRAG_TYPE) as ObjectKind;
    if (!kind || !svgRef.current) return;
    e.preventDefault();
    dispatch({ type: 'add', kind, at: clientToCanvas(svgRef.current, e.clientX, e.clientY) });
  };

  const save = useCallback(async () => {
    if (saving) return;
    const draft: ChartDraft = { name: layout.name.trim(), canvas: layout.canvas, objects: layout.objects };
    const v = validateChart(draft);
    if (!v.ok) {
      setSaveError(v.errors[0]);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      let chart: SeatingChart;
      if (meta) {
        chart = await updateChart(meta.id, draft, meta.revision);
      } else {
        chart = await createChart(draft);
        onCreated(chart);
      }
      setMeta({ id: chart.id, revision: chart.revision });
      dispatch({ type: 'saved' });
      setConflict(null);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      if (err instanceof ChartApiError && err.status === 409 && typeof err.details?.revision === 'number') {
        setConflict(err.details.revision);
      } else if (err instanceof ChartApiError && err.errors.length) {
        setSaveError(err.errors.join(' '));
      } else {
        setSaveError(err instanceof Error ? err.message : 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }, [dispatch, layout, meta, onCreated, onUnauthorized, saving]);

  if (load.status === 'loading') {
    return (
      <div className={styles.page}>
        <p className={styles.state}>Loading chart…</p>
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <div className={styles.page}>
        <p className={`${styles.state} ${styles.stateError}`}>{load.message}</p>
        <div className={styles.stateActions}>
          <button type="button" className={styles.btnGhost} onClick={onBack}>
            ← Charts
          </button>
          {chartId && (
            <button type="button" className={styles.btnGhost} onClick={() => void loadChart(chartId)}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={handleBack}>
          ← Charts
        </button>
        <input
          className={styles.name}
          value={layout.name}
          placeholder="Venue 1 Seating"
          maxLength={60}
          onChange={(e) => dispatch({ type: 'setName', name: e.target.value })}
          aria-label="Chart name"
        />
        <span className={styles.seatCount}>
          <strong>{seats}</strong> seats
        </span>
        <div className={styles.headerTools}>
          <button type="button" className={styles.iconBtn} onClick={() => dispatch({ type: 'undo' })} disabled={past.length === 0} title="Undo (⌘Z)" aria-label="Undo">
            ↶
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => dispatch({ type: 'redo' })} disabled={future.length === 0} title="Redo (⌘⇧Z)" aria-label="Redo">
            ↷
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => fit()} title="Fit to view" aria-label="Fit to view">
            ⤢
          </button>
          <button
            type="button"
            className={styles.save}
            onClick={() => void save()}
            disabled={saving || !validation.ok || (!dirty && !!meta)}
            title={!validation.ok ? validation.errors[0] : undefined}
          >
            {saving ? 'Saving…' : savedFlash ? 'Saved ✓' : meta ? 'Save' : 'Create'}
          </button>
        </div>
      </header>

      {conflict !== null && (
        <div className={styles.banner} role="alert">
          <span>This chart changed elsewhere (now revision {conflict}). Reload to get the latest — your unsaved edits will be lost.</span>
          <button type="button" className={styles.bannerBtn} onClick={() => meta && void loadChart(meta.id)}>
            Reload
          </button>
        </div>
      )}
      {saveError && (
        <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
          <span>{saveError}</span>
          <button type="button" className={styles.bannerBtn} onClick={() => setSaveError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <Palette hasStage={hasStage} onAdd={addAtCenter} />

      <div className={styles.body}>
        <div className={styles.canvasWrap} ref={canvasWrapRef} onDragOver={onDragOver} onDrop={onDrop}>
          <SeatMap
            layout={layout}
            mode="edit"
            viewBox={viewBox}
            selection={selectionSet}
            grid
            svgRef={svgRef}
            svgProps={svgProps}
            overlay={({ scale }) => <Handles objects={layout.objects} selection={selection} scale={scale} marquee={marquee} />}
          />
        </div>

        <Inspector layout={layout} selection={selection} dispatch={dispatch} errors={validation.errors} />
      </div>
    </div>
  );
}
