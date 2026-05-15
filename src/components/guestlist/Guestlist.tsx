import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CheckinMap, Party } from '../../types/guestlist.ts';
import {
  UnauthorizedError,
  checkIn as apiCheckIn,
  clearPasscode,
  getPasscode,
  getShow,
  listShows,
  uncheck as apiUncheck,
} from '../../services/guestlist.ts';
import SignIn from './SignIn.tsx';
import ShowPicker from './ShowPicker.tsx';
import SearchBar from './SearchBar.tsx';
import PartyList from './PartyList.tsx';
import CheckInModal from './CheckInModal.tsx';
import styles from './Guestlist.module.css';

type AuthState = 'signed-out' | 'signed-in';

export default function Guestlist() {
  const [auth, setAuth] = useState<AuthState>(() =>
    getPasscode() ? 'signed-in' : 'signed-out',
  );
  const [shows, setShows] = useState<string[] | null>(null);
  const [selectedShow, setSelectedShow] = useState<string | null>(null);
  const [parties, setParties] = useState<Party[] | null>(null);
  const [checkedIn, setCheckedIn] = useState<CheckinMap>({});
  const [query, setQuery] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Guestlist · DJKMD Legends';
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

  useEffect(() => {
    if (auth !== 'signed-in') return;
    let cancelled = false;
    (async () => {
      try {
        const ids = await listShows();
        if (cancelled) return;
        setShows(ids);
        setLoadError(null);
        if (ids.length === 1) setSelectedShow(ids[0]);
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

  useEffect(() => {
    if (!selectedShow) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getShow(selectedShow);
        if (cancelled) return;
        setParties(data.parties);
        setCheckedIn(data.checkedIn);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          setAuth('signed-out');
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Failed to load show');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedShow]);

  const handleSignedIn = useCallback(() => {
    setAuth('signed-in');
  }, []);

  const handleSignOut = useCallback(() => {
    clearPasscode();
    setShows(null);
    setSelectedShow(null);
    setParties(null);
    setCheckedIn({});
    setAuth('signed-out');
  }, []);

  const filteredParties = useMemo(() => {
    if (!parties) return [];
    const q = query.trim().toLowerCase();
    if (!q) return parties;
    return parties.filter((p) => {
      const full = `${p.firstName} ${p.lastName}`.toLowerCase();
      return full.includes(q);
    });
  }, [parties, query]);

  const stats = useMemo(() => {
    if (!parties) return null;
    const totalTickets = parties.reduce((s, p) => s + p.quantity, 0);
    const checkedInTickets = parties
      .filter((p) => checkedIn[p.id])
      .reduce((s, p) => s + p.quantity, 0);
    const checkedInParties = parties.filter((p) => checkedIn[p.id]).length;
    return { totalParties: parties.length, totalTickets, checkedInParties, checkedInTickets };
  }, [parties, checkedIn]);

  const handleCheckIn = useCallback(
    async (party: Party) => {
      if (!selectedShow) return;
      const now = new Date().toISOString();
      setCheckedIn((prev) => ({ ...prev, [party.id]: now }));
      try {
        const at = await apiCheckIn(selectedShow, party.id);
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
      }
    },
    [selectedShow],
  );

  const handleUncheck = useCallback(
    async (party: Party) => {
      if (!selectedShow) return;
      const previous = checkedIn[party.id];
      setCheckedIn((prev) => {
        const next = { ...prev };
        delete next[party.id];
        return next;
      });
      try {
        await apiUncheck(selectedShow, party.id);
      } catch (err) {
        if (previous) {
          setCheckedIn((prev) => ({ ...prev, [party.id]: previous }));
        }
        if (err instanceof UnauthorizedError) {
          setAuth('signed-out');
          return;
        }
        alert(err instanceof Error ? err.message : 'Failed to undo check-in');
      }
    },
    [selectedShow, checkedIn],
  );

  if (auth === 'signed-out') {
    return (
      <div className={styles.page}>
        <SignIn onSignedIn={handleSignedIn} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Guestlist</h1>
          <button className={styles.signOut} onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
        {shows && shows.length > 0 && (
          <ShowPicker shows={shows} selected={selectedShow} onSelect={setSelectedShow} />
        )}
        {selectedShow && (
          <SearchBar value={query} onChange={setQuery} />
        )}
        {stats && (
          <div className={styles.stats} aria-live="polite">
            <span>
              <strong>{stats.checkedInParties}</strong> / {stats.totalParties} parties
            </span>
            <span>
              <strong>{stats.checkedInTickets}</strong> / {stats.totalTickets} tickets
            </span>
          </div>
        )}
      </header>

      <main className={styles.main}>
        {loadError && <p className={styles.error}>{loadError}</p>}
        {!selectedShow && shows && shows.length === 0 && (
          <p className={styles.empty}>No shows uploaded yet.</p>
        )}
        {selectedShow && !parties && !loadError && (
          <p className={styles.empty}>Loading guestlist…</p>
        )}
        {selectedShow && parties && (
          <PartyList
            parties={filteredParties}
            checkedIn={checkedIn}
            onSelect={setSelectedParty}
          />
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
