import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CheckinMap, Party } from '../../types/guestlist.ts';
import {
  UnauthorizedError,
  checkIn as legacyCheckIn,
  clearPasscode,
  getPasscode,
  getShow,
  listShows,
  uncheck as legacyUncheck,
} from '../../services/guestlist.ts';
import {
  eventCheckIn,
  eventUncheck,
  getEventGuests,
  listEvents,
  type EventGuests,
  type ManagedEvent,
} from '../../services/admin-events.ts';
import SignIn from './SignIn.tsx';
import SearchBar from './SearchBar.tsx';
import PartyList from './PartyList.tsx';
import CheckInModal from './CheckInModal.tsx';
import OccupancyChart from './OccupancyChart.tsx';
import { occupancyCounts } from './occupancy.ts';
import { printCheckinSheet } from './print-sheet.ts';
import styles from './Guestlist.module.css';

type AuthState = 'signed-out' | 'signed-in';

/** Roster presentation for reserved-seating shows (v0.5 P4). */
type RosterView = 'list' | 'chart';
const VIEW_KEY = 'guestlist:view';
/** Chart view refreshes itself so a second phone sees check-ins without touching anything. */
const POLL_MS = 8000;

function storedView(): RosterView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'chart' ? 'chart' : 'list';
  } catch {
    return 'list';
  }
}

/** What the door staff picked to check people into. */
type Selection =
  | { kind: 'event'; id: string; label: string }
  | { kind: 'legacy'; id: string; label: string };

function formatEventLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatLegacyLabel(id: string): string {
  const [y, m, d] = id.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return id;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface GuestlistProps {
  /** When provided, the picker shows a "← Menu" button (admin shell only). */
  onBack?: () => void;
}

export default function Guestlist({ onBack }: GuestlistProps = {}) {
  const [auth, setAuth] = useState<AuthState>(() =>
    getPasscode() ? 'signed-in' : 'signed-out',
  );
  const [events, setEvents] = useState<ManagedEvent[] | null>(null);
  const [legacyShows, setLegacyShows] = useState<string[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [parties, setParties] = useState<Party[] | null>(null);
  const [checkedIn, setCheckedIn] = useState<CheckinMap>({});
  const [query, setQuery] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seating, setSeating] = useState<NonNullable<EventGuests['seating']> | null>(null);
  const [view, setView] = useState<RosterView>(storedView);
  /** Parties with a check-in / undo in flight: a poll must not overwrite their optimistic state. */
  const busyRef = useRef(new Set<string>());

  const changeView = useCallback((next: RosterView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // private mode — the choice just won't persist
    }
  }, []);

  useEffect(() => {
    document.title = 'Check-in · DJKMD Legends';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const previousContent = meta.content;
    meta.content = 'noindex, nofollow';
    return () => {
      meta.content = previousContent;
    };
  }, []);

  // Load the event list (KV) + legacy date rosters once signed in.
  useEffect(() => {
    if (auth !== 'signed-in') return;
    let cancelled = false;
    (async () => {
      try {
        const [evs, legacy] = await Promise.all([listEvents(), listShows()]);
        if (cancelled) return;
        setEvents(evs);
        setLegacyShows(legacy);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          setAuth('signed-out');
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load shows');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // Pick (or clear) a show, resetting the roster view in the same render.
  const chooseSelection = useCallback((sel: Selection | null) => {
    setParties(null);
    setCheckedIn({});
    setSeating(null);
    setQuery('');
    setSelection(sel);
  }, []);

  // Load the roster whenever a show is selected.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    (async () => {
      try {
        const data: EventGuests =
          selection.kind === 'event'
            ? await getEventGuests(selection.id)
            : await getShow(selection.id);
        if (cancelled) return;
        setParties(data.parties);
        setCheckedIn(data.checkedIn);
        setSeating(data.seating ?? null);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          setAuth('signed-out');
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load roster');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection]);

  // Silent refresh for the chart: server state wins except for parties whose
  // check-in is still in flight on this phone.
  const refetch = useCallback(async () => {
    if (!selection || selection.kind !== 'event') return;
    try {
      const data = await getEventGuests(selection.id);
      setParties(data.parties);
      setSeating(data.seating ?? null);
      setCheckedIn((prev) => {
        const next: CheckinMap = { ...data.checkedIn };
        for (const id of busyRef.current) {
          if (prev[id]) next[id] = prev[id];
          else delete next[id];
        }
        return next;
      });
    } catch (err) {
      if (err instanceof UnauthorizedError) setAuth('signed-out');
      // any other hiccup: keep what we have, the next tick will try again
    }
  }, [selection]);

  const hasSeating = seating !== null;
  useEffect(() => {
    if (view !== 'chart' || !hasSeating || !selection || selection.kind !== 'event') return;
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
      } else {
        stop();
      }
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [view, hasSeating, selection, refetch]);

  const handleSignedIn = useCallback(() => setAuth('signed-in'), []);

  const handleSignOut = useCallback(() => {
    clearPasscode();
    setEvents(null);
    setLegacyShows([]);
    setSelection(null);
    setParties(null);
    setCheckedIn({});
    setAuth('signed-out');
  }, []);

  const { upcoming, previous } = useMemo(() => {
    const now = new Date().getTime();
    const up: ManagedEvent[] = [];
    const prev: ManagedEvent[] = [];
    for (const e of events ?? []) {
      if (new Date(e.endTime).getTime() >= now) up.push(e);
      else prev.push(e);
    }
    up.sort((a, b) => a.startTime.localeCompare(b.startTime));
    prev.sort((a, b) => b.startTime.localeCompare(a.startTime));
    return { upcoming: up, previous: prev };
  }, [events]);

  const filteredParties = useMemo(() => {
    if (!parties) return [];
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q),
    );
  }, [parties, query]);

  const stats = useMemo(() => {
    if (!parties) return null;
    const totalTickets = parties.reduce((s, p) => s + p.quantity, 0);
    const checkedInTickets = parties
      .filter((p) => checkedIn[p.id])
      .reduce((s, p) => s + p.quantity, 0);
    const checkedInParties = parties.filter((p) => checkedIn[p.id]).length;
    const seats = seating ? occupancyCounts(seating.layout, seating.seats, checkedIn) : null;
    return { totalParties: parties.length, totalTickets, checkedInParties, checkedInTickets, seats };
  }, [parties, checkedIn, seating]);

  const handleCheckIn = useCallback(
    async (party: Party) => {
      if (!selection) return;
      const now = new Date().toISOString();
      busyRef.current.add(party.id);
      setCheckedIn((prev) => ({ ...prev, [party.id]: now }));
      try {
        const at =
          selection.kind === 'event'
            ? await eventCheckIn(selection.id, party.id)
            : await legacyCheckIn(selection.id, party.id);
        setCheckedIn((prev) => ({ ...prev, [party.id]: at }));
      } catch (err) {
        setCheckedIn((prev) => {
          const next = { ...prev };
          delete next[party.id];
          return next;
        });
        if (err instanceof UnauthorizedError) {
          setAuth('signed-out');
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to check in');
      } finally {
        busyRef.current.delete(party.id);
      }
    },
    [selection],
  );

  // Print a paper door sheet for the selected show (Keith's checklist).
  const handlePrint = useCallback(() => {
    if (!selection || !parties) return;
    let subtitle: string | null = null;
    if (selection.kind === 'event') {
      const ev = events?.find((e) => e.id === selection.id);
      if (ev) {
        const d = new Date(ev.startTime);
        const when = Number.isNaN(d.getTime())
          ? ev.startTime
          : d.toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            });
        subtitle = `${when} · ${ev.venueName}, ${ev.venueAddress}`;
      }
    }
    printCheckinSheet({ title: selection.label, subtitle, parties, checkedIn });
  }, [selection, parties, events, checkedIn]);

  const handleUncheck = useCallback(
    async (party: Party) => {
      if (!selection) return;
      const previousAt = checkedIn[party.id];
      busyRef.current.add(party.id);
      setCheckedIn((prev) => {
        const next = { ...prev };
        delete next[party.id];
        return next;
      });
      try {
        if (selection.kind === 'event') await eventUncheck(selection.id, party.id);
        else await legacyUncheck(selection.id, party.id);
      } catch (err) {
        if (previousAt) setCheckedIn((prev) => ({ ...prev, [party.id]: previousAt }));
        if (err instanceof UnauthorizedError) {
          setAuth('signed-out');
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to undo check-in');
      } finally {
        busyRef.current.delete(party.id);
      }
    },
    [selection, checkedIn],
  );

  if (auth === 'signed-out') {
    return (
      <div className={styles.page}>
        <SignIn onSignedIn={handleSignedIn} />
      </div>
    );
  }

  // ── Picker view ──────────────────────────────────────────────
  if (!selection) {
    const hasAny = upcoming.length > 0 || previous.length > 0 || legacyShows.length > 0;
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headerTop}>
            {onBack ? (
              <button className={styles.signOut} onClick={onBack} type="button">
                ← Menu
              </button>
            ) : (
              <h1 className={styles.title}>Door Check-in</h1>
            )}
            <button className={styles.signOut} onClick={handleSignOut} type="button">
              Sign out
            </button>
          </div>
          {onBack && <h1 className={styles.title}>Door Check-in</h1>}
        </header>
        <main className={styles.main}>
          {loadError && <p className={styles.error}>{loadError}</p>}
          {events === null && !loadError && <p className={styles.empty}>Loading shows…</p>}

          {events !== null && !hasAny && (
            <p className={styles.empty}>No shows yet.</p>
          )}

          {upcoming.length > 0 && (
            <section className={styles.pickerSection}>
              <h2 className={styles.pickerHeading}>Upcoming</h2>
              <ul className={styles.pickerList}>
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={styles.pickerItem}
                      onClick={() => chooseSelection({ kind: 'event', id: e.id, label: e.showName })}
                    >
                      <span className={styles.pickerName}>{e.showName}</span>
                      <span className={styles.pickerMeta}>
                        {formatEventLabel(e.startTime)}
                        {e.soldOut && ' · Sold Out'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {previous.length > 0 && (
            <section className={styles.pickerSection}>
              <button
                type="button"
                className={styles.pickerHeadingToggle}
                onClick={() => setShowPrevious((v) => !v)}
                aria-expanded={showPrevious}
              >
                {showPrevious ? '▾' : '▸'} Previous events ({previous.length})
              </button>
              {showPrevious && (
                <ul className={styles.pickerList}>
                  {previous.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        className={styles.pickerItem}
                        onClick={() => chooseSelection({ kind: 'event', id: e.id, label: e.showName })}
                      >
                        <span className={styles.pickerName}>{e.showName}</span>
                        <span className={styles.pickerMeta}>{formatEventLabel(e.startTime)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {legacyShows.length > 0 && (
            <section className={styles.pickerSection}>
              <h2 className={styles.pickerHeading}>Imported rosters (CSV)</h2>
              <ul className={styles.pickerList}>
                {legacyShows.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={styles.pickerItem}
                      onClick={() =>
                        chooseSelection({ kind: 'legacy', id, label: formatLegacyLabel(id) })
                      }
                    >
                      <span className={styles.pickerName}>{formatLegacyLabel(id)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>
    );
  }

  // ── Roster view ──────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <button className={styles.signOut} onClick={() => chooseSelection(null)} type="button">
            ← Shows
          </button>
          <div className={styles.headerActions}>
            <button
              className={styles.signOut}
              onClick={handlePrint}
              type="button"
              disabled={!parties || parties.length === 0}
            >
              Print list
            </button>
            <button className={styles.signOut} onClick={handleSignOut} type="button">
              Sign out
            </button>
          </div>
        </div>
        <h1 className={styles.title}>{selection.label}</h1>
        {seating && (
          <div className={styles.segmented} role="group" aria-label="Roster view">
            <button
              type="button"
              className={view === 'list' ? `${styles.segment} ${styles.segmentOn}` : styles.segment}
              aria-pressed={view === 'list'}
              onClick={() => changeView('list')}
            >
              List
            </button>
            <button
              type="button"
              className={view === 'chart' ? `${styles.segment} ${styles.segmentOn}` : styles.segment}
              aria-pressed={view === 'chart'}
              onClick={() => changeView('chart')}
            >
              Chart
            </button>
          </div>
        )}
        {(!seating || view === 'list') && <SearchBar value={query} onChange={setQuery} />}
        {stats && (
          <div className={styles.stats} aria-live="polite">
            <span>
              <strong>{stats.checkedInParties}</strong> / {stats.totalParties} parties
            </span>
            <span>
              <strong>{stats.checkedInTickets}</strong> / {stats.totalTickets} tickets
            </span>
            {stats.seats && (
              <span>
                <strong>{stats.seats.arrived}</strong> / {stats.seats.sold} seats arrived
              </span>
            )}
          </div>
        )}
      </header>

      <main className={styles.main}>
        {loadError && <p className={styles.error}>{loadError}</p>}
        {!parties && !loadError && <p className={styles.empty}>Loading roster…</p>}
        {parties && seating && view === 'chart' ? (
          <OccupancyChart
            layout={seating.layout}
            seats={seating.seats}
            checkedIn={checkedIn}
            parties={parties}
            onPartyTap={setSelectedParty}
          />
        ) : (
          <>
            {parties && parties.length === 0 && (
              <p className={styles.empty}>No purchases yet for this show.</p>
            )}
            {parties && parties.length > 0 && (
              <PartyList parties={filteredParties} checkedIn={checkedIn} onSelect={setSelectedParty} />
            )}
          </>
        )}
      </main>

      {selectedParty && (
        <CheckInModal
          party={selectedParty}
          checkedInAt={checkedIn[selectedParty.id] ?? null}
          onClose={() => setSelectedParty(null)}
          onCheckIn={async () => {
            await handleCheckIn(selectedParty);
            setSelectedParty(null);
          }}
          onUncheck={async () => {
            await handleUncheck(selectedParty);
            setSelectedParty(null);
          }}
        />
      )}
    </div>
  );
}
