/**
 * Seating Charts — one card per saved layout with Edit / Duplicate / Delete
 * and a "New seating chart" button. Delete is refused (with the reason)
 * while an upcoming show uses the chart; past shows hold their own snapshot.
 */
import { useCallback, useEffect, useState } from 'react';
import { deleteChart, duplicateChart, listCharts, type ChartSummary } from '../../../services/charts.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import ConfirmModal from '../ManageShows/ConfirmModal.tsx';
import SeatMap from '@seating/SeatMap.tsx';
import { layoutBounds } from '@seating/geometry.ts';
import { fitViewBox } from '@seating/view.ts';
import styles from './ChartsList.module.css';

const THUMB_W = 132;
const THUMB_H = 88;

interface ChartsListProps {
  onNew: () => void;
  onEdit: (id: string) => void;
  onUnauthorized: () => void;
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatShowDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

export default function ChartsList({ onNew, onEdit, onUnauthorized }: ChartsListProps) {
  const [charts, setCharts] = useState<ChartSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ChartSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setCharts(await listCharts());
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load charts');
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDuplicate = useCallback(
    async (c: ChartSummary) => {
      setBusyId(c.id);
      try {
        await duplicateChart(c.id);
        await load();
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to duplicate chart');
      } finally {
        setBusyId(null);
      }
    },
    [load, onUnauthorized],
  );

  const handleConfirmDelete = useCallback(async () => {
    const c = confirmTarget;
    if (!c) return;
    setBusyId(c.id);
    try {
      await deleteChart(c.id);
      setCharts((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
      setConfirmTarget(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      alert(err instanceof Error ? err.message : 'Failed to delete chart');
    } finally {
      setBusyId(null);
    }
  }, [confirmTarget, onUnauthorized]);

  if (error) {
    return (
      <div className={styles.wrap}>
        <p className={styles.error}>{error}</p>
        <button className={styles.retry} onClick={() => void load()} type="button">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <span className={styles.overline}>Venues</span>
          <h1 className={styles.title}>Seating Charts</h1>
          <p className={styles.subtitle}>
            Build a floor plan once per venue, then attach it to a show to sell reserved seats.
          </p>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onNew}>
          + New seating chart
        </button>
      </div>

      {charts === null ? (
        <p className={styles.empty}>Loading charts…</p>
      ) : charts.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No seating charts yet</p>
          <p className={styles.emptyText}>
            Start with the venue you play most. Drop in the stage, the tables and any rows of seats, then save it
            under the venue's name.
          </p>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onNew}>
            Build the first chart
          </button>
        </div>
      ) : (
        <ul className={styles.list}>
          {charts.map((c) => {
            const inUse = c.usedBy.length > 0;
            const busy = busyId === c.id;
            return (
              <li key={c.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <button
                    type="button"
                    className={styles.thumb}
                    onClick={() => onEdit(c.id)}
                    aria-label={`Edit ${c.name}`}
                    title="Edit"
                  >
                    <SeatMap
                      layout={{ canvas: c.canvas, objects: c.objects }}
                      mode="view"
                      labels={false}
                      viewBox={fitViewBox(layoutBounds({ canvas: c.canvas, objects: c.objects }), THUMB_W, THUMB_H, 30)}
                    />
                  </button>
                  <div className={styles.headBody}>
                    <div className={styles.headText}>
                      <h2 className={styles.name}>{c.name}</h2>
                      <p className={styles.meta}>
                        <strong>{c.seatCount}</strong> seats · {c.objectSummary}
                      </p>
                      <p className={styles.updated}>Edited {formatUpdated(c.updatedAt)}</p>
                    </div>
                    <span className={`${styles.status} ${inUse ? styles.statusUsed : styles.statusFree}`}>
                      {inUse ? `${c.usedBy.length} show${c.usedBy.length === 1 ? '' : 's'}` : 'Unused'}
                    </span>
                  </div>
                </div>

                {inUse && (
                  <p className={styles.usedBy}>
                    Used by{' '}
                    {c.usedBy.map((u, i) => (
                      <span key={u.eventId}>
                        {i > 0 && ', '}
                        <strong>{u.showName}</strong> ({formatShowDate(u.startTime)})
                      </span>
                    ))}
                  </p>
                )}

                <div className={styles.toolbar}>
                  <div className={styles.toolGroup}>
                    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onEdit(c.id)} disabled={busy}>
                      Edit
                    </button>
                    <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void handleDuplicate(c)} disabled={busy}>
                      {busy ? 'Working…' : 'Duplicate'}
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnDanger}`}
                    onClick={() => setConfirmTarget(c)}
                    disabled={busy || inUse}
                    title={inUse ? 'In use by an upcoming show — detach it there first' : 'Delete this chart'}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {confirmTarget && (
        <ConfirmModal
          title={`Delete "${confirmTarget.name}"?`}
          message="This removes the layout for good. Shows that already snapshotted it are not affected."
          confirmLabel="Delete chart"
          busy={busyId === confirmTarget.id}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
