/**
 * The room as the door sees it (v0.5 P4): every seat coloured by state —
 * open, held (someone mid-checkout), sold, arrived — with a tap on a sold seat
 * opening its party. Used by Door Check-in's Chart view and Manage Shows'
 * Seating chart modal; both poll and hand fresh props down.
 */
import { useMemo } from 'react';
import SeatMap from '@seating/SeatMap.tsx';
import type { SeatState, SeatingChart } from '@seating/types.ts';
import { layoutBounds } from '@seating/geometry.ts';
import { fitViewBox } from '@seating/view.ts';
import type { CheckinMap, Party } from '../../types/guestlist.ts';
import type { SeatOccupancy } from '../../services/admin-events.ts';
import { occupancyCounts } from './occupancy.ts';
import styles from './OccupancyChart.module.css';

export interface OccupancyChartProps {
  layout: SeatingChart;
  seats: Record<string, SeatOccupancy>;
  checkedIn: CheckinMap;
  parties: Party[];
  /** A sold seat was tapped: open its party. */
  onPartyTap?: (party: Party) => void;
  /** Optional slot rendered under the banner (P5: Assign seats). */
  needsSeatsAction?: (party: Party) => React.ReactNode;
}

const VIEW_W = 400;
const VIEW_H = 300;

export default function OccupancyChart({ layout, seats, checkedIn, parties, onPartyTap, needsSeatsAction }: OccupancyChartProps) {
  const byId = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  const seatStates = useMemo(() => {
    const out: Record<string, SeatState> = {};
    for (const [id, o] of Object.entries(seats)) {
      if (o.status === 'sold') out[id] = o.partyId && checkedIn[o.partyId] ? 'checkedIn' : 'sold';
      else if (o.status === 'held') out[id] = 'held';
    }
    return out;
  }, [seats, checkedIn]);

  const counts = useMemo(() => occupancyCounts(layout, seats, checkedIn), [layout, seats, checkedIn]);
  const viewBox = useMemo(() => fitViewBox(layoutBounds(layout), VIEW_W, VIEW_H, 30), [layout]);
  const needsSeats = useMemo(() => parties.filter((p) => p.seatStatus && p.seatStatus !== 'assigned'), [parties]);

  const handleSeatTap = (seatId: string) => {
    const o = seats[seatId];
    if (!o?.partyId) return;
    const party = byId.get(o.partyId);
    if (party) onPartyTap?.(party);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.counts} aria-live="polite">
        <span>
          <strong>{counts.arrived}</strong> / {counts.sold} seats arrived
        </span>
        <span>
          <strong>{counts.total - counts.sold - counts.held}</strong> open
        </span>
        {counts.held > 0 && (
          <span>
            <strong>{counts.held}</strong> in checkout
          </span>
        )}
      </div>

      <div className={styles.chart} data-testid="occupancy-chart">
        <SeatMap layout={layout} mode="view" viewBox={viewBox} seatStates={seatStates} onSeatTap={handleSeatTap} />
      </div>

      <div className={styles.legend}>
        <span className={`${styles.swatch} ${styles.swatchOpen}`} /> open
        <span className={`${styles.swatch} ${styles.swatchSold}`} /> sold
        <span className={`${styles.swatch} ${styles.swatchArrived}`} /> arrived
        <span className={`${styles.swatch} ${styles.swatchHeld}`} /> held
      </div>
      <p className={styles.hint}>Tap a sold seat to check its party in.</p>

      {needsSeats.length > 0 && (
        <div className={styles.banner} role="status">
          <p className={styles.bannerTitle}>
            {needsSeats.length === 1 ? '1 party needs seats' : `${needsSeats.length} parties need seats`}
          </p>
          <ul className={styles.bannerList}>
            {needsSeats.map((p) => (
              <li key={p.id} className={styles.bannerRow}>
                <span>
                  <strong>{`${p.firstName} ${p.lastName}`.trim() || p.email}</strong> · {p.quantity} {p.quantity === 1 ? 'ticket' : 'tickets'}
                  {p.seatStatus === 'partial' && p.seatLabels?.length ? ` · has ${p.seatLabels.join(', ')}` : ' · no seats yet'}
                </span>
                {needsSeatsAction?.(p)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
