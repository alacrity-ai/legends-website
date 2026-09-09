/**
 * "Seating chart" select shared by Create a Show and Edit. Picks a layout
 * to snapshot onto the show (or general admission). The caller disables
 * its Capacity field while a chart is chosen — capacity is the seat count.
 */
import { useEffect, useState } from 'react';
import { listCharts, type ChartSummary } from '../../../services/charts.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import styles from './EventForm.module.css';

interface SeatingChartPickerProps {
  value: string | null;
  onChange: (chartId: string | null, seatCount: number | null) => void;
  disabled?: boolean;
  /** Why the picker is locked (e.g. tickets have sold). */
  lockedReason?: string | null;
  onUnauthorized: () => void;
}

export default function SeatingChartPicker({ value, onChange, disabled, lockedReason, onUnauthorized }: SeatingChartPickerProps) {
  const [charts, setCharts] = useState<ChartSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCharts()
      .then((list) => {
        if (!cancelled) setCharts(list);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load seating charts');
      });
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  const selected = charts?.find((c) => c.id === value) ?? null;
  const locked = Boolean(lockedReason);

  return (
    <label className={styles.field}>
      <span className={styles.label}>Seating chart</span>
      <select
        className={styles.input}
        value={value ?? ''}
        disabled={disabled || locked || charts === null}
        onChange={(e) => {
          const id = e.target.value || null;
          const chart = charts?.find((c) => c.id === id) ?? null;
          onChange(id, chart ? chart.seatCount : null);
        }}
      >
        <option value="">General admission (no chart)</option>
        {(charts ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.seatCount} seats
          </option>
        ))}
        {value && charts && !selected && <option value={value}>Attached chart (no longer in the list)</option>}
      </select>
      {locked ? (
        <span className={styles.hintLeft}>{lockedReason}</span>
      ) : loadError ? (
        <span className={styles.errorInline}>{loadError}</span>
      ) : charts && charts.length === 0 ? (
        <span className={styles.hintLeft}>No layouts yet — build one under Seating Charts to sell reserved seats.</span>
      ) : selected ? (
        <span className={styles.hintLeft}>
          Buyers pick their seats on <strong>{selected.name}</strong>. Capacity becomes {selected.seatCount} seats.
        </span>
      ) : (
        <span className={styles.hintLeft}>Leave as general admission, or pick a venue layout to sell reserved seats.</span>
      )}
    </label>
  );
}
