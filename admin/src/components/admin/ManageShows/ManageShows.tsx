import { useCallback, useEffect, useState } from 'react';
import {
  deleteEvent,
  getEventGuests,
  listEvents,
  setCancelled,
  setSoldOut,
  type ManagedEvent,
} from '../../../services/admin-events.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import { downloadDataUrl, qrPngDataUrl, slugify } from '../../../utils/qr.ts';
import EditShow from './EditShow.tsx';
import { downloadTicketHolders } from '../../../utils/ticket-holders.ts';
import CancelShowModal from './CancelShowModal.tsx';
import ConfirmModal from './ConfirmModal.tsx';
import SeatingModal from './SeatingModal.tsx';
import styles from './ManageShows.module.css';

interface ManageShowsProps {
  onUnauthorized: () => void;
}

/** The on-site share/QR target that opens a show with the quantity stepper. */
function shareUrl(id: string): string {
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://djkmdlegends.com';
  return `${origin}/?event=${id}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export default function ManageShows({ onUnauthorized }: ManageShowsProps) {
  const [events, setEvents] = useState<ManagedEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ManagedEvent | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ManagedEvent | null>(null);
  const [seatingTarget, setSeatingTarget] = useState<ManagedEvent | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ManagedEvent | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<ManagedEvent | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const handleSaved = useCallback((updated: ManagedEvent) => {
    const withRemaining: ManagedEvent = {
      ...updated,
      remaining:
        updated.capacity != null ? Math.max(0, updated.capacity - (updated.sold ?? 0)) : null,
    };
    setEvents((prev) => (prev ? prev.map((e) => (e.id === updated.id ? withRemaining : e)) : prev));
    setEditingEvent(null);
  }, []);

  const handleCopy = useCallback(async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // Clipboard API unavailable — fall back to a prompt the user can copy from.
      window.prompt('Copy this share link:', url);
    }
  }, []);

  const handleDownloadQr = useCallback((showName: string, url: string) => {
    const dataUrl = qrPngDataUrl(url);
    downloadDataUrl(dataUrl, `qr-${slugify(showName)}.png`);
  }, []);

  const handleSetCancelled = useCallback(
    async (ev: ManagedEvent, cancelled: boolean) => {
      setCancellingId(ev.id);
      try {
        const updated = await setCancelled(ev.id, cancelled);
        setEvents((prev) =>
          prev ? prev.map((e) => (e.id === ev.id ? { ...e, cancelledAt: updated.cancelledAt } : e)) : prev,
        );
        setCancelTarget(null);
        setRestoreTarget(null);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to update the show');
      } finally {
        setCancellingId(null);
      }
    },
    [onUnauthorized],
  );

  const handleDownloadHolders = useCallback(
    async (ev: ManagedEvent) => {
      try {
        const { parties } = await getEventGuests(ev.id);
        if (parties.length === 0) {
          alert('Nobody holds tickets to this show.');
          return;
        }
        downloadTicketHolders(ev, parties);
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to load the ticket holders');
      }
    },
    [onUnauthorized],
  );

  const handleToggleSoldOut = useCallback(
    async (ev: ManagedEvent) => {
      setTogglingId(ev.id);
      try {
        const updated = await setSoldOut(ev.id, !ev.soldOut);
        setEvents((prev) =>
          prev ? prev.map((e) => (e.id === ev.id ? { ...e, soldOut: updated.soldOut } : e)) : prev,
        );
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to update sold-out status');
      } finally {
        setTogglingId(null);
      }
    },
    [onUnauthorized],
  );

  // Re-sync moved into the Seating chart modal (P4); it reports back here.
  const handleResynced = useCallback((updated: ManagedEvent) => {
    setEvents((prev) =>
      prev
        ? prev.map((e) =>
            e.id === updated.id
              ? {
                  ...e,
                  seating: updated.seating,
                  capacity: updated.capacity,
                  soldOut: updated.soldOut,
                  remaining: updated.capacity != null ? Math.max(0, updated.capacity - (updated.sold ?? 0)) : null,
                }
              : e,
          )
        : prev,
    );
    setSeatingTarget((cur) => (cur && cur.id === updated.id ? { ...cur, seating: updated.seating, capacity: updated.capacity } : cur));
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await listEvents();
      setEvents(list);
      setError(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load shows');
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleConfirmDelete = useCallback(async () => {
    const ev = confirmTarget;
    if (!ev) return;
    setDeletingId(ev.id);
    try {
      await deleteEvent(ev.id);
      setEvents((prev) => (prev ? prev.filter((e) => e.id !== ev.id) : prev));
      setConfirmTarget(null);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      alert(err instanceof Error ? err.message : 'Failed to delete show');
    } finally {
      setDeletingId(null);
    }
  }, [confirmTarget, onUnauthorized]);

  if (editingEvent) {
    return (
      <div className={styles.wrap}>
        <EditShow
          event={editingEvent}
          onCancel={() => setEditingEvent(null)}
          onSaved={handleSaved}
          onUnauthorized={onUnauthorized}
        />
      </div>
    );
  }

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

  if (events === null) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>Loading shows…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={styles.wrap}>
        <h1 className={styles.title}>Manage Shows</h1>
        <p className={styles.empty}>No shows are tracked in KV yet.</p>
      </div>
    );
  }

  // A show is past once its end time has gone — the same rule the public site uses to drop it.
  const now = Date.now();
  const isPast = (ev: ManagedEvent) => new Date(ev.endTime).getTime() < now;
  const upcoming = events.filter((ev) => !isPast(ev)).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const past = events.filter(isPast).sort((a, b) => b.startTime.localeCompare(a.startTime));

  const renderCard = (ev: ManagedEvent, ended: boolean) => {
    const sold = ev.sold ?? 0;
    const cancelled = !!ev.cancelledAt;
    const capped = ev.capacity != null;
    const pct = capped ? Math.min(100, Math.round((sold / ev.capacity!) * 100)) : 0;
    const full = capped && sold >= ev.capacity!;
    return (
      <li key={ev.id} className={styles.card}>
        <div className={styles.cardHead}>
          <div className={styles.headText}>
            <h2 className={styles.name}>{ev.showName}</h2>
            <p className={styles.when}>{formatDateTime(ev.startTime)}</p>
            <p className={styles.where}>
              {ev.venueName} · {ev.venueAddress}
            </p>
          </div>
          <span
            className={`${styles.status} ${cancelled ? styles.statusCancelled : ended ? styles.statusEnded : ev.soldOut ? styles.statusSold : styles.statusLive}`}
          >
            {cancelled ? 'Cancelled' : ended ? 'Ended' : ev.soldOut ? 'Sold Out' : 'Live'}
          </span>
        </div>

        <div className={styles.capacity}>
          {capped ? (
            <>
              <div className={styles.meter}>
                <div
                  className={`${styles.meterFill} ${full ? styles.meterFillFull : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={styles.capacityText}>
                <strong>{sold}</strong> / {ev.capacity} sold
                {ev.remaining != null && <> · {ev.remaining} left</>}
              </span>
            </>
          ) : (
            <span className={styles.capacityText}>
              <strong>{sold}</strong> sold · unlimited capacity
            </span>
          )}
        </div>

        <div className={styles.tickets}>
          {ev.seating && (
            <span className={`${styles.ticketPill} ${styles.seatingPill}`} title={`Snapshot of ${ev.seating.chartName} (rev ${ev.seating.chartRevision})`}>
              Reserved seating
              <span className={styles.ticketPrice}>{ev.seating.chartName} · {ev.seating.seatCount} seats</span>
            </span>
          )}
          {ev.tickets.map((t) => (
            <span key={t.ticketType} className={styles.ticketPill}>
              {t.ticketType}
              <span className={styles.ticketPrice}>{formatPrice(t.priceCents)}</span>
            </span>
          ))}
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolGroup}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => void handleCopy(ev.id, shareUrl(ev.id))}
              title={shareUrl(ev.id)}
            >
              {copiedKey === ev.id ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => handleDownloadQr(ev.showName, shareUrl(ev.id))}
              title="Download a QR code that opens this show on the site"
            >
              QR code
            </button>
          </div>
          <div className={styles.toolGroup}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => setEditingEvent(ev)}
            >
              Edit
            </button>
            {!ended && !cancelled && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => void handleToggleSoldOut(ev)}
                disabled={togglingId === ev.id}
              >
                {togglingId === ev.id
                  ? 'Saving…'
                  : ev.soldOut
                    ? 'Mark available'
                    : 'Mark sold out'}
              </button>
            )}
            {ev.seating && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setSeatingTarget(ev)}
                title="Who sits where, live"
              >
                Seating chart
              </button>
            )}
            {cancelled && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => void handleDownloadHolders(ev)}
                title="Names, emails and phone numbers of everyone holding tickets (CSV)"
              >
                Ticket holders
              </button>
            )}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => (cancelled ? setRestoreTarget(ev) : setCancelTarget(ev))}
              disabled={cancellingId === ev.id}
            >
              {cancelled ? 'Restore show' : 'Cancel show'}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => setConfirmTarget(ev)}
              disabled={deletingId === ev.id}
            >
              {deletingId === ev.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>

        <span className={styles.id}>{ev.id}</span>
      </li>
    );
  };

  return (
    <div className={styles.wrap}>
      <span className={styles.overline}>Box Office</span>
      <h1 className={styles.title}>Manage Shows</h1>
      <p className={styles.subtitle}>
        {upcoming.length} upcoming{past.length > 0 && <> · {past.length} past</>}
      </p>

      {upcoming.length === 0 && <p className={styles.empty}>No upcoming shows.</p>}
      <ul className={styles.list}>{upcoming.map((ev) => renderCard(ev, false))}</ul>

      {past.length > 0 && (
        <details className={styles.past}>
          <summary className={styles.pastSummary}>Past shows ({past.length})</summary>
          <ul className={styles.list}>{past.map((ev) => renderCard(ev, true))}</ul>
        </details>
      )}

      {seatingTarget && (
        <SeatingModal
          event={seatingTarget}
          onClose={() => setSeatingTarget(null)}
          onResynced={handleResynced}
          onUnauthorized={onUnauthorized}
        />
      )}

      {cancelTarget && (
        <CancelShowModal
          event={cancelTarget}
          busy={cancellingId === cancelTarget.id}
          onConfirm={() => void handleSetCancelled(cancelTarget, true)}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {restoreTarget && (
        <ConfirmModal
          title={`Restore “${restoreTarget.showName}”?`}
          message={
            new Date(restoreTarget.endTime).getTime() < Date.now()
              ? 'The show goes back to Ended.'
              : 'The show goes back on sale on the website right away.'
          }
          confirmLabel="Restore show"
          cancelLabel="Leave cancelled"
          busy={cancellingId === restoreTarget.id}
          onConfirm={() => void handleSetCancelled(restoreTarget, false)}
          onCancel={() => setRestoreTarget(null)}
        />
      )}

      {confirmTarget && (
        <ConfirmModal
          title={`Delete “${confirmTarget.showName}”?`}
          message="This removes the show from the site, deactivates its Square checkout link(s), and deletes its image. This cannot be undone."
          confirmLabel="Delete show"
          busy={deletingId === confirmTarget.id}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
