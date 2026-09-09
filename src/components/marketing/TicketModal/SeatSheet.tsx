/**
 * "We've saved seats for your party" — the reserved-seating step of the ticket
 * modal (v0.5 P3). Opens with the party's seats already held by the worker,
 * shows a small diagram, and offers exactly two moves: continue to Square, or
 * change table (a list of tables that seat the whole party). Nobody taps a
 * seat. Closing releases the hold; a hold that lapses is silently re-made.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SeatMap from '@seating/SeatMap.tsx';
import type { SeatState } from '@seating/types.ts';
import { layoutBounds, objectBounds } from '@seating/geometry.ts';
import { fitViewBox } from '@seating/view.ts';
import { fetchSeating, holdSeats, releaseHold, startCheckout, type HeldSeats, type SeatingTable } from '../../../services/events.ts';
import styles from './SeatSheet.module.css';

interface SeatSheetProps {
  eventId: string;
  ticketType: string;
  quantity: number;
  priceLabel: string;
  onBack: () => void;
}

type State =
  | { status: 'holding' }
  | { status: 'ready'; hold: HeldSeats; note?: string }
  | { status: 'failed'; message: string };

const DIAGRAM_W = 320;
const DIAGRAM_H = 200;

export default function SeatSheet({ eventId, ticketType, quantity, priceLabel, onBack }: SeatSheetProps) {
  const [state, setState] = useState<State>({ status: 'holding' });
  const [changing, setChanging] = useState(false);
  const [tables, setTables] = useState<SeatingTable[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const holdRef = useRef<HeldSeats | null>(null);
  const leavingRef = useRef(false);

  const take = useCallback(
    async (objectId?: string) => {
      const prev = holdRef.current;
      const hold = await holdSeats(eventId, {
        ticketType,
        quantity,
        ...(objectId ? { objectId } : {}),
        ...(prev ? { replaceHoldId: prev.holdId } : {}),
      });
      holdRef.current = hold;
      return { hold, prev };
    },
    [eventId, ticketType, quantity],
  );

  // Hold on open.
  useEffect(() => {
    let cancelled = false;
    take()
      .then(({ hold }) => {
        if (!cancelled) setState({ status: 'ready', hold });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : 'Could not hold seats.' });
      });
    return () => {
      cancelled = true;
    };
  }, [take]);

  // Release on unmount unless we are leaving for Square.
  useEffect(() => {
    return () => {
      const h = holdRef.current;
      if (h && !leavingRef.current) releaseHold(eventId, h.holdId);
    };
  }, [eventId]);

  // Silent re-hold when the clock runs out while the sheet is open.
  useEffect(() => {
    if (state.status !== 'ready' || paying) return;
    const ms = state.hold.expiresAt - Date.now() - 5000;
    const timer = window.setTimeout(() => {
      void take()
        .then(({ hold, prev }) => {
          const moved = prev && prev.objects.map((o) => o.id).join() !== hold.objects.map((o) => o.id).join();
          setState({ status: 'ready', hold, note: moved ? 'Your first table was taken while you waited, so we found you the next best one.' : undefined });
        })
        .catch((err) => setState({ status: 'failed', message: err instanceof Error ? err.message : 'Could not hold seats.' }));
    }, Math.max(1000, ms));
    return () => window.clearTimeout(timer);
  }, [state, paying, take]);

  const openChange = async () => {
    setChanging(true);
    setTablesError(null);
    if (!tables) {
      try {
        const info = await fetchSeating(eventId, quantity);
        setTables(info.tables);
      } catch (err) {
        setTablesError(err instanceof Error ? err.message : 'Could not load tables.');
      }
    }
  };

  const moveTo = async (objectId: string) => {
    setMoving(objectId);
    try {
      const { hold } = await take(objectId);
      setState({ status: 'ready', hold });
      setChanging(false);
      setTables(null); // availability changed; reload next time
    } catch (err) {
      setTablesError(err instanceof Error ? err.message : 'Could not move your party.');
      // Refresh the list so a table that just filled up drops out.
      fetchSeating(eventId, quantity).then((info) => setTables(info.tables)).catch(() => {});
    } finally {
      setMoving(null);
    }
  };

  const continueToPay = async () => {
    if (state.status !== 'ready') return;
    setPaying(true);
    setPayError(null);
    try {
      const url = await startCheckout(eventId, ticketType, quantity, state.hold.holdId);
      leavingRef.current = true;
      window.location.href = url;
    } catch (err) {
      setPaying(false);
      setPayError(err instanceof Error ? err.message : 'Could not start checkout.');
    }
  };

  const seatStates = useMemo(() => {
    if (state.status !== 'ready') return {};
    const out: Record<string, SeatState> = {};
    for (const id of state.hold.seatIds) out[id] = 'selected';
    return out;
  }, [state]);

  const viewBox = useMemo(() => {
    if (state.status !== 'ready') return { x: 0, y: 0, w: 1200, h: 800 };
    const layout = state.hold.layout;
    const ids = new Set(state.hold.objects.map((o) => o.id));
    const stage = layout.objects.find((o) => o.kind === 'stage');
    const focus = layout.objects.filter((o) => ids.has(o.id) || (stage && o.id === stage.id));
    const b = focus.length ? focus.map(objectBounds).reduce((a, c) => ({ minX: Math.min(a.minX, c.minX), minY: Math.min(a.minY, c.minY), maxX: Math.max(a.maxX, c.maxX), maxY: Math.max(a.maxY, c.maxY) })) : layoutBounds(layout);
    return fitViewBox(b, DIAGRAM_W, DIAGRAM_H, 50);
  }, [state]);

  if (state.status === 'holding') {
    return (
      <div className={styles.sheet}>
        <p className={styles.status}>Finding the best seats for your party…</p>
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className={styles.sheet}>
        <h3 className={styles.title}>Sorry — we couldn't seat your party</h3>
        <p className={styles.body}>{state.message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onBack}>
            ← Back to tickets
          </button>
        </div>
      </div>
    );
  }

  const { hold } = state;
  const currentIds = new Set(hold.objects.map((o) => o.id));
  const candidates = (tables ?? []).filter((t) => t.fits && !currentIds.has(t.objectId));

  return (
    <div className={styles.sheet}>
      {!changing ? (
        <>
          <h3 className={styles.title}>{hold.message}</h3>
          <p className={styles.seats}>
            {hold.seatLabels.length <= 6 ? `Seats ${hold.seatLabels.join(', ')}` : `${hold.seatLabels.length} seats together`}
            {' · '}
            {quantity} × {ticketType} · {priceLabel}
          </p>
          {state.note && <p className={styles.note}>{state.note}</p>}

          <div className={styles.diagram} aria-label="Where your seats are">
            <SeatMap layout={hold.layout} mode="pick" viewBox={viewBox} seatStates={seatStates} />
            <span className={styles.legend}>
              <span className={styles.legendYou} /> your seats
            </span>
          </div>

          <p className={styles.held}>Held for you for 10 minutes.</p>

          {payError && (
            <p className={styles.error} role="alert">
              {payError}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => void continueToPay()} disabled={paying}>
              {paying ? 'One moment…' : 'Looks good, continue'}
            </button>
            <button type="button" className={styles.secondary} onClick={() => void openChange()} disabled={paying}>
              Change table
            </button>
            <button type="button" className={styles.link} onClick={onBack} disabled={paying}>
              ← Back to tickets
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className={styles.title}>Pick a table for your party of {quantity}</h3>
          <p className={styles.body}>Only tables with {quantity === 1 ? 'a free seat' : `${quantity} seats together`} are listed, nearest the stage first.</p>
          {tablesError && (
            <p className={styles.error} role="alert">
              {tablesError}
            </p>
          )}
          {tables === null && !tablesError ? (
            <p className={styles.status}>Loading tables…</p>
          ) : candidates.length === 0 ? (
            <p className={styles.body}>No other table can seat your whole party right now.</p>
          ) : (
            <ul className={styles.tableList}>
              {candidates.map((t, i) => (
                <li key={t.objectId}>
                  <button type="button" className={styles.tableRow} onClick={() => void moveTo(t.objectId)} disabled={moving !== null}>
                    <span className={styles.tableName}>{t.name}</span>
                    <span className={styles.tableMeta}>
                      {i === 0 ? 'nearest the stage · ' : ''}
                      {t.free} {t.free === 1 ? 'seat' : 'seats'} free
                    </span>
                    <span className={styles.tableGo}>{moving === t.objectId ? '…' : '›'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setChanging(false)} disabled={moving !== null}>
              Keep {hold.objects.length === 1 ? tableName(hold) : 'my seats'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function tableName(hold: HeldSeats): string {
  const o = hold.objects[0];
  const m = o.label.match(/^T\s*(\d+)$/i);
  if (o.kind === 'row') return /^row/i.test(o.label) ? o.label : `Row ${o.label}`;
  return m ? `Table ${m[1]}` : /^table/i.test(o.label) ? o.label : `Table ${o.label}`;
}
