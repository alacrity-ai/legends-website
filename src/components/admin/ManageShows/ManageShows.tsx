import { useCallback, useEffect, useState } from 'react';
import {
  deleteEvent,
  listEvents,
  type ManagedEvent,
} from '../../../services/admin-events.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import styles from './ManageShows.module.css';

interface ManageShowsProps {
  onUnauthorized: () => void;
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

  const handleCopy = useCallback(async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // Clipboard API unavailable — fall back to a prompt the user can copy from.
      window.prompt('Copy this checkout link:', url);
    }
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

  const handleDelete = useCallback(
    async (ev: ManagedEvent) => {
      const ok = window.confirm(
        `Delete "${ev.showName}"? This removes it from the site and deactivates its Square checkout link(s). This cannot be undone.`,
      );
      if (!ok) return;
      setDeletingId(ev.id);
      try {
        await deleteEvent(ev.id);
        setEvents((prev) => (prev ? prev.filter((e) => e.id !== ev.id) : prev));
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to delete show');
      } finally {
        setDeletingId(null);
      }
    },
    [onUnauthorized],
  );

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

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Manage Shows</h1>
      <p className={styles.subtitle}>
        {events.length} show{events.length === 1 ? '' : 's'} tracked in KV.
      </p>

      <ul className={styles.list}>
        {events.map((ev) => (
          <li key={ev.id} className={styles.row}>
            <div className={styles.info}>
              <span className={styles.name}>{ev.showName}</span>
              <span className={styles.meta}>{formatDateTime(ev.startTime)}</span>
              <span className={styles.meta}>
                {ev.venueName} · {ev.venueAddress}
              </span>
              <div className={styles.tickets}>
                {ev.tickets.map((t) => {
                  const key = `${ev.id}:${t.ticketType}`;
                  return (
                    <div key={key} className={styles.ticketRow}>
                      <span className={styles.ticketLabel}>
                        {t.ticketType} · {formatPrice(t.priceCents)}
                      </span>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() => void handleCopy(key, t.checkoutUrl)}
                        title={t.checkoutUrl}
                      >
                        {copiedKey === key ? 'Copied!' : 'Copy link'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <span className={styles.id}>id: {ev.id}</span>
            </div>
            <button
              className={styles.deleteButton}
              onClick={() => void handleDelete(ev)}
              disabled={deletingId === ev.id}
              type="button"
            >
              {deletingId === ev.id ? 'Deleting…' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
