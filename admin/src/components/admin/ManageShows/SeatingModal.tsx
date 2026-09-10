/**
 * Manage Shows → Seating chart (v0.5 P4): the live room for one show, the
 * same chart the door uses, refreshed every 8 s while open. Tapping a sold
 * seat opens its party (check-in works here too). Re-sync from the master
 * layout lives here while nothing has sold; the unassigned list gets its
 * Assign action in P5.
 */
import { useCallback, useEffect, useState } from 'react';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import { eventCheckIn, eventUncheck, getEventGuests, resendConfirmation, resyncSeating, setPartySeats, type EventGuests, type ManagedEvent } from '../../../services/admin-events.ts';
import type { CheckinMap, Party } from '../../../types/guestlist.ts';
import OccupancyChart from '../../guestlist/OccupancyChart.tsx';
import CheckInModal from '../../guestlist/CheckInModal.tsx';
import SeatAssignSheet from '../../guestlist/SeatAssignSheet.tsx';
import styles from './SeatingModal.module.css';

const POLL_MS = 8000;

interface SeatingModalProps {
  event: ManagedEvent;
  onClose: () => void;
  /** Re-sync changed the snapshot (seat count / capacity). */
  onResynced: (updated: ManagedEvent) => void;
  onUnauthorized: () => void;
}

export default function SeatingModal({ event, onClose, onResynced, onUnauthorized }: SeatingModalProps) {
  const [data, setData] = useState<EventGuests | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<CheckinMap>({});
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [assignParty, setAssignParty] = useState<Party | null>(null);
  const [resyncing, setResyncing] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const next = await getEventGuests(event.id);
      setData(next);
      setCheckedIn(next.checkedIn);
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load the room');
    }
  }, [event.id, onUnauthorized]);

  // Load, then poll while visible. Everything stops when the modal unmounts.
  useEffect(() => {
    void refetch();
    let timer: number | null = null;
    const start = () => {
      if (timer === null) timer = window.setInterval(() => void refetch(), POLL_MS);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
        start();
      } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refetch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !selectedParty && !assignParty) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, selectedParty, assignParty]);

  const handleResync = async () => {
    setResyncing(true);
    try {
      const updated = await resyncSeating(event.id);
      onResynced(updated);
      await refetch();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      alert(err instanceof Error ? err.message : 'Failed to re-sync seating');
    } finally {
      setResyncing(false);
    }
  };

  const checkIn = async (party: Party) => {
    setCheckedIn((prev) => ({ ...prev, [party.id]: new Date().toISOString() }));
    try {
      const at = await eventCheckIn(event.id, party.id);
      setCheckedIn((prev) => ({ ...prev, [party.id]: at }));
    } catch (err) {
      setCheckedIn((prev) => {
        const next = { ...prev };
        delete next[party.id];
        return next;
      });
      if (err instanceof UnauthorizedError) onUnauthorized();
      else alert(err instanceof Error ? err.message : 'Failed to check in');
    }
  };

  const uncheck = async (party: Party) => {
    const previous = checkedIn[party.id];
    setCheckedIn((prev) => {
      const next = { ...prev };
      delete next[party.id];
      return next;
    });
    try {
      await eventUncheck(event.id, party.id);
    } catch (err) {
      if (previous) setCheckedIn((prev) => ({ ...prev, [party.id]: previous }));
      if (err instanceof UnauthorizedError) onUnauthorized();
      else alert(err instanceof Error ? err.message : 'Failed to undo check-in');
    }
  };

  const saveSeats = async (party: Party, seatIds: string[]) => {
    try {
      await setPartySeats(event.id, party.id, seatIds);
      setAssignParty(null);
    } finally {
      void refetch();
    }
  };

  const sold = event.sold ?? 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Seating chart — ${event.showName}`} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <span className={styles.overline}>Seating chart</span>
            <h2 className={styles.title}>{event.showName}</h2>
            {event.seating && (
              <p className={styles.meta}>
                {event.seating.chartName} · {event.seating.seatCount} seats · {sold} sold
              </p>
            )}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error && <p className={styles.error}>{error}</p>}
        {!data && !error && <p className={styles.empty}>Loading the room…</p>}
        {data?.seating && (
          <OccupancyChart
            layout={data.seating.layout}
            seats={data.seating.seats}
            checkedIn={checkedIn}
            parties={data.parties}
            onPartyTap={setSelectedParty}
            needsSeatsAction={(p) => (
              <button type="button" className={styles.ghost} onClick={() => setAssignParty(p)}>
                Assign seats
              </button>
            )}
          />
        )}
        {data && !data.seating && <p className={styles.empty}>This show has no seating chart.</p>}

        {sold === 0 && event.seating && (
          <div className={styles.tools}>
            <button type="button" className={styles.ghost} onClick={() => void handleResync()} disabled={resyncing} title="Re-copy the current master layout onto this show (only possible before any ticket sells)">
              {resyncing ? 'Syncing…' : 'Re-sync from layout'}
            </button>
          </div>
        )}
      </div>

      {selectedParty && (
        <CheckInModal
          party={selectedParty}
          checkedInAt={checkedIn[selectedParty.id] ?? null}
          onClose={() => setSelectedParty(null)}
          onCheckIn={async () => {
            await checkIn(selectedParty);
            setSelectedParty(null);
          }}
          onUncheck={async () => {
            await uncheck(selectedParty);
            setSelectedParty(null);
          }}
          onChangeSeats={() => {
            setAssignParty(selectedParty);
            setSelectedParty(null);
          }}
          onResendConfirmation={async () => {
            await resendConfirmation(event.id, selectedParty.id);
            void refetch();
          }}
        />
      )}

      {assignParty && data?.seating && (
        <SeatAssignSheet
          layout={data.seating.layout}
          seats={data.seating.seats}
          party={data.parties.find((p) => p.id === assignParty.id) ?? assignParty}
          onSave={(ids) => saveSeats(assignParty, ids)}
          onClose={() => setAssignParty(null)}
        />
      )}
    </div>
  );
}
