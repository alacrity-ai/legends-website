/**
 * Staff pick seats for one party (v0.5 P5): tap seats on the room to select
 * up to the party's ticket count, or let "Best available" choose — then
 * Save. Seats sold to other parties and live holds are dimmed and inert.
 */
import { useEffect, useMemo, useState } from 'react';
import SeatMap from '@seating/SeatMap.tsx';
import type { SeatState, SeatingChart } from '@seating/types.ts';
import { allSeats, layoutBounds } from '@seating/geometry.ts';
import { fitViewBox } from '@seating/view.ts';
import { chooseSeats } from '@seating/assign.ts';
import { seatLabel } from '@seating/ids.ts';
import type { Party } from '../../types/guestlist.ts';
import type { SeatOccupancy } from '../../services/admin-events.ts';
import styles from './SeatAssignSheet.module.css';

interface SeatAssignSheetProps {
  layout: SeatingChart;
  seats: Record<string, SeatOccupancy>;
  party: Party;
  /** Persist; throw to show the message (a 409 names the seats that were just taken). */
  onSave: (seatIds: string[]) => Promise<void>;
  onClose: () => void;
}

const VIEW_W = 400;
const VIEW_H = 300;

export default function SeatAssignSheet({ layout, seats, party, onSave, onClose }: SeatAssignSheetProps) {
  const own = useMemo(() => new Set(party.seats ?? []), [party.seats]);
  const [selected, setSelected] = useState<string[]>(() => [...(party.seats ?? [])]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const labels = useMemo(() => {
    const byObject = new Map(layout.objects.map((o) => [o.id, o]));
    return (id: string) => {
      const dot = id.lastIndexOf('.');
      const o = byObject.get(id.slice(0, dot));
      return o ? seatLabel(o, Number(id.slice(dot + 1))) : id;
    };
  }, [layout]);

  /** Seats this party may take: free now, or its own. */
  const takeable = useMemo(() => {
    const out = new Set<string>();
    for (const s of allSeats(layout)) {
      const o = seats[s.id];
      if (!o || o.status === 'available' || own.has(s.id)) out.add(s.id);
    }
    return out;
  }, [layout, seats, own]);

  const seatStates = useMemo(() => {
    const out: Record<string, SeatState> = {};
    for (const [id, o] of Object.entries(seats)) {
      if (own.has(id)) continue;
      if (o.status === 'sold') out[id] = 'sold';
      else if (o.status === 'held') out[id] = 'held';
    }
    for (const id of selected) out[id] = 'selected';
    return out;
  }, [seats, own, selected]);

  const viewBox = useMemo(() => fitViewBox(layoutBounds(layout), VIEW_W, VIEW_H, 30), [layout]);

  const toggle = (seatId: string) => {
    setError(null);
    if (!takeable.has(seatId)) return;
    setSelected((cur) => {
      if (cur.includes(seatId)) return cur.filter((s) => s !== seatId);
      if (cur.length >= party.quantity) {
        setHint(`This party has ${party.quantity} ${party.quantity === 1 ? 'ticket' : 'tickets'} — tap a chosen seat to swap it.`);
        return cur;
      }
      setHint(null);
      return [...cur, seatId];
    });
  };

  const bestAvailable = () => {
    setError(null);
    setHint(null);
    const pick = chooseSeats(layout, takeable, party.quantity);
    if (!pick) {
      setHint(`No ${party.quantity} seats are free together right now — tap seats one by one.`);
      return;
    }
    setSelected(pick.seatIds);
  };

  const unchanged = selected.length === own.size && selected.every((s) => own.has(s));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save seats.');
    } finally {
      setSaving(false);
    }
  };

  const name = `${party.firstName} ${party.lastName}`.trim() || party.email;

  return (
    <div className={styles.overlay} onClick={() => !saving && onClose()}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Seats for ${name}`} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <span className={styles.overline}>{own.size ? 'Change seats' : 'Assign seats'}</span>
            <h2 className={styles.title}>{name}</h2>
            <p className={styles.meta}>
              {party.quantity} {party.quantity === 1 ? 'ticket' : 'tickets'}
              {own.size > 0 && ` · now ${(party.seatLabels ?? []).join(', ')}`}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close" disabled={saving}>
            ×
          </button>
        </header>

        <p className={styles.picked} aria-live="polite" data-testid="assign-picked">
          {selected.length === 0 ? 'No seats chosen — tap seats on the room.' : `Chosen: ${selected.map(labels).join(', ')}`}
          {selected.length > 0 && selected.length < party.quantity && ` (${party.quantity - selected.length} more to pick)`}
        </p>

        <div className={styles.chart} data-testid="assign-chart">
          <SeatMap layout={layout} mode="pick" viewBox={viewBox} seatStates={seatStates} onSeatTap={toggle} />
        </div>
        <div className={styles.legend}>
          <span className={`${styles.swatch} ${styles.swatchChosen}`} /> chosen
          <span className={`${styles.swatch} ${styles.swatchOpen}`} /> open
          <span className={`${styles.swatch} ${styles.swatchTaken}`} /> taken
        </div>

        {hint && <p className={styles.hint}>{hint}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void save()} disabled={saving || unchanged}>
            {saving ? 'Saving…' : selected.length === 0 ? 'Release seats' : `Save ${selected.length} ${selected.length === 1 ? 'seat' : 'seats'}`}
          </button>
          <button type="button" className={styles.ghost} onClick={bestAvailable} disabled={saving}>
            Best available
          </button>
          <button type="button" className={styles.link} onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
