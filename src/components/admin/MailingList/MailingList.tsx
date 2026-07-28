import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listSubscribers,
  subscribersToCsv,
  type Subscriber,
  type SubscriberSource,
} from '../../../services/mailing-list-admin.ts';
import { UnauthorizedError } from '../../../services/guestlist.ts';
import styles from './MailingList.module.css';

interface MailingListProps {
  onUnauthorized: () => void;
}

type SourceFilter = 'all' | SubscriberSource;

const SOURCE_LABELS: Record<SubscriberSource, string> = {
  signup: 'Signup',
  purchase: 'Buyer',
  import: 'Imported',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function MailingList({ onUnauthorized }: MailingListProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listSubscribers();
        if (cancelled) return;
        setSubscribers(list);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load mailing list');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onUnauthorized]);

  const filtered = useMemo(() => {
    if (!subscribers) return [];
    const q = query.trim().toLowerCase();
    return subscribers.filter(
      (s) =>
        (sourceFilter === 'all' || s.source === sourceFilter) &&
        (!q || (s.name ?? '').toLowerCase().includes(q) || s.email.toLowerCase().includes(q)),
    );
  }, [subscribers, query, sourceFilter]);

  // Export what's on screen: the current search + filter selection.
  const handleExport = useCallback(() => {
    const csv = subscribersToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mailing-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className={styles.wrap}>
      <span className={styles.overline}>Admin</span>
      <h1 className={styles.title}>Mailing List</h1>
      <p className={styles.subtitle}>
        Everyone we can email — website signups, ticket buyers, and imported rosters, one row per
        person.
      </p>

      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="search"
          placeholder="Search name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search subscribers"
        />
        <div className={styles.filters} role="group" aria-label="Filter by source">
          {(['all', 'signup', 'purchase', 'import'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={f === sourceFilter ? `${styles.filter} ${styles.filterActive}` : styles.filter}
              onClick={() => setSourceFilter(f)}
            >
              {f === 'all' ? 'All' : SOURCE_LABELS[f]}
            </button>
          ))}
        </div>
        <button
          className={styles.export}
          type="button"
          onClick={handleExport}
          disabled={filtered.length === 0}
        >
          Export CSV{subscribers ? ` (${filtered.length})` : ''}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {!subscribers && !error && <p className={styles.empty}>Loading mailing list…</p>}
      {subscribers && filtered.length === 0 && !error && (
        <p className={styles.empty}>
          {subscribers.length === 0 ? 'No subscribers yet.' : 'No matches.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className={styles.list}>
          {filtered.map((s) => (
            <li key={s.email} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>{s.name ?? '—'}</span>
                <span className={styles.email}>{s.email}</span>
              </div>
              <div className={styles.meta}>
                <span className={`${styles.badge} ${styles[`badge_${s.source}`]}`}>
                  {SOURCE_LABELS[s.source]}
                </span>
                <span className={styles.date}>{formatDate(s.addedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
