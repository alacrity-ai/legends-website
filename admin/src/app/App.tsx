import { useCallback, useEffect, useState } from 'react';
import { clearPasscode, getPasscode } from '../services/guestlist.ts';
import Guestlist from '../components/guestlist/Guestlist.tsx';
import EventForm from '../components/admin/EventForm/EventForm.tsx';
import ManageShows from '../components/admin/ManageShows/ManageShows.tsx';
import MailingList from '../components/admin/MailingList/MailingList.tsx';
import Sales from '../components/admin/Sales/Sales.tsx';
import ChartsList from '../components/admin/Charts/ChartsList.tsx';
import ChartEditor from '../components/admin/Charts/ChartEditor.tsx';
import AdminSignIn from '../components/admin/AdminSignIn.tsx';
import styles from './App.module.css';

type View = 'menu' | 'checkin' | 'events' | 'manage' | 'mailing' | 'sales' | 'charts' | 'chartEdit';

interface Route {
  view: View;
  /** /charts/:id → the chart id; /charts/new → null. */
  chartId?: string | null;
}

function routeFromPath(): Route {
  if (typeof window === 'undefined') return { view: 'menu' };
  const path = window.location.pathname.replace(/\/$/, '');
  // Root-level paths on the admin host; the legacy /admin/* and /guestlist
  // shapes are accepted so old bookmarks redirected from the public site land.
  const p = path.replace(/^\/admin(?=\/|$)/, '');
  if (p === '/events/new') return { view: 'events' };
  if (p === '/events') return { view: 'manage' };
  if (p === '/mailing-list') return { view: 'mailing' };
  if (p === '/sales') return { view: 'sales' };
  if (p === '/charts') return { view: 'charts' };
  if (p === '/charts/new') return { view: 'chartEdit', chartId: null };
  const chart = p.match(/^\/charts\/(c_[a-f0-9]{8})$/);
  if (chart) return { view: 'chartEdit', chartId: chart[1] };
  if (p === '/checkin' || p === '/guestlist') return { view: 'checkin' };
  return { view: 'menu' };
}

function pathFor(route: Route): string {
  switch (route.view) {
    case 'events':
      return '/events/new';
    case 'manage':
      return '/events';
    case 'mailing':
      return '/mailing-list';
    case 'sales':
      return '/sales';
    case 'checkin':
      return '/checkin';
    case 'charts':
      return '/charts';
    case 'chartEdit':
      return route.chartId ? `/charts/${route.chartId}` : '/charts/new';
    default:
      return '/';
  }
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getPasscode()));
  const [route, setRoute] = useState<Route>(routeFromPath);
  const view = route.view;

  useEffect(() => {
    document.title = 'Legends Admin';
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

  const navigate = useCallback((to: View, chartId?: string | null) => {
    const next: Route = to === 'chartEdit' ? { view: to, chartId: chartId ?? null } : { view: to };
    window.history.pushState({}, '', pathFor(next));
    setRoute(next);
  }, []);

  /** Swap the URL without a history entry (after creating a chart at /charts/new). */
  const replaceRoute = useCallback((next: Route) => {
    window.history.replaceState({}, '', pathFor(next));
    setRoute(next);
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath());
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

  // The chart editor owns the whole viewport (header + canvas + inspector).
  if (view === 'chartEdit') {
    return (
      <ChartEditor
        key={route.chartId ?? 'new'}
        chartId={route.chartId ?? null}
        onBack={() => navigate('charts')}
        onCreated={(chart) => replaceRoute({ view: 'chartEdit', chartId: chart.id })}
        onUnauthorized={handleUnauthorized}
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.brand} onClick={() => navigate('menu')} type="button">
          Legends Admin
        </button>
        <button className={styles.signOut} onClick={handleSignOut} type="button">
          Sign out
        </button>
      </header>

      <main className={styles.main}>
        {view === 'menu' && (
          <nav className={styles.menu}>
            <button className={styles.menuCard} onClick={() => navigate('sales')} type="button">
              <span className={styles.menuTitle}>Sales</span>
              <span className={styles.menuDesc}>
                Gross ticket sales by show, who is buying, and which Square location the money
                lands in.
              </span>
            </button>
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
            <button className={styles.menuCard} onClick={() => navigate('charts')} type="button">
              <span className={styles.menuTitle}>Seating Charts</span>
              <span className={styles.menuDesc}>
                Build and reuse venue layouts — tables, rows and the stage — for reserved-seat shows.
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

        {view === 'charts' && (
          <>
            <button className={styles.back} onClick={() => navigate('menu')} type="button">
              ← Back to menu
            </button>
            <ChartsList
              onNew={() => navigate('chartEdit', null)}
              onEdit={(id) => navigate('chartEdit', id)}
              onUnauthorized={handleUnauthorized}
            />
          </>
        )}

        {view === 'sales' && (
          <>
            <button className={styles.back} onClick={() => navigate('menu')} type="button">
              ← Back to menu
            </button>
            <Sales onUnauthorized={handleUnauthorized} />
          </>
        )}
      </main>
    </div>
  );
}
