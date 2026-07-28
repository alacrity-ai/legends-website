import { useCallback, useEffect, useState } from 'react';
import { clearPasscode, getPasscode } from '../../services/guestlist.ts';
import Guestlist from '../guestlist/Guestlist.tsx';
import EventForm from './EventForm/EventForm.tsx';
import ManageShows from './ManageShows/ManageShows.tsx';
import MailingList from './MailingList/MailingList.tsx';
import AdminSignIn from './AdminSignIn.tsx';
import styles from './Admin.module.css';

type View = 'menu' | 'checkin' | 'events' | 'manage' | 'mailing';

function viewFromPath(): View {
  if (typeof window === 'undefined') return 'menu';
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '/admin/events/new') return 'events';
  if (path === '/admin/events') return 'manage';
  if (path === '/admin/mailing-list') return 'mailing';
  if (path === '/admin/checkin' || path === '/guestlist') return 'checkin';
  return 'menu';
}

export default function Admin() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getPasscode()));
  const [view, setView] = useState<View>(viewFromPath);

  useEffect(() => {
    document.title = 'Admin · DJKMD Legends';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = 'noindex, nofollow';
    return () => {
      meta.content = previous;
    };
  }, []);

  const navigate = useCallback((to: View) => {
    const path =
      to === 'events'
        ? '/admin/events/new'
        : to === 'manage'
          ? '/admin/events'
          : to === 'mailing'
            ? '/admin/mailing-list'
            : to === 'checkin'
              ? '/admin/checkin'
              : '/admin';
    window.history.pushState({}, '', path);
    setView(to);
  }, []);

  useEffect(() => {
    const onPop = () => setView(viewFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleSignOut = useCallback(() => {
    clearPasscode();
    setAuthed(false);
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearPasscode();
    setAuthed(false);
  }, []);

  if (!authed) {
    return <AdminSignIn onSignedIn={() => setAuthed(true)} />;
  }

  // The check-in tool is self-contained (its own header + sign out).
  if (view === 'checkin') {
    return <Guestlist onBack={() => navigate('menu')} />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.brand} onClick={() => navigate('menu')} type="button">
          DJKMD Admin
        </button>
        <button className={styles.signOut} onClick={handleSignOut} type="button">
          Sign out
        </button>
      </header>

      <main className={styles.main}>
        {view === 'menu' && (
          <nav className={styles.menu}>
            <button className={styles.menuCard} onClick={() => navigate('events')} type="button">
              <span className={styles.menuTitle}>Create a Show</span>
              <span className={styles.menuDesc}>
                Add a new event with ticket types, prices, and an optional capacity.
              </span>
            </button>
            <button className={styles.menuCard} onClick={() => navigate('manage')} type="button">
              <span className={styles.menuTitle}>Manage Shows</span>
              <span className={styles.menuDesc}>
                View all shows tracked in KV and delete them.
              </span>
            </button>
            <button className={styles.menuCard} onClick={() => navigate('checkin')} type="button">
              <span className={styles.menuTitle}>Door Check-in</span>
              <span className={styles.menuDesc}>
                Look up and check in guests at the door for a show.
              </span>
            </button>
            <button className={styles.menuCard} onClick={() => navigate('mailing')} type="button">
              <span className={styles.menuTitle}>Mailing List</span>
              <span className={styles.menuDesc}>
                Everyone we can email — signups, ticket buyers, and imports. Search and export.
              </span>
            </button>
          </nav>
        )}

        {view === 'events' && (
          <>
            <button className={styles.back} onClick={() => navigate('menu')} type="button">
              ← Back to menu
            </button>
            <EventForm onUnauthorized={handleUnauthorized} />
          </>
        )}

        {view === 'manage' && (
          <>
            <button className={styles.back} onClick={() => navigate('menu')} type="button">
              ← Back to menu
            </button>
            <ManageShows onUnauthorized={handleUnauthorized} />
          </>
        )}

        {view === 'mailing' && (
          <>
            <button className={styles.back} onClick={() => navigate('menu')} type="button">
              ← Back to menu
            </button>
            <MailingList onUnauthorized={handleUnauthorized} />
          </>
        )}
      </main>
    </div>
  );
}
