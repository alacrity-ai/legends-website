/**
 * /calendar — every upcoming show by date (LGD-40).
 *
 * One month at a time, from this month to the month of the farthest show.
 * Desktop cells carry titled chips; phones get dots with the month's cards
 * underneath. Either way a show opens the same TicketModal the homepage uses,
 * so checkout (including reserved seating) is unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '../layout/Header/Header.tsx';
import Footer from '../layout/Footer/Footer.tsx';
import Container from '../layout/Container/Container.tsx';
import MailingList from '../marketing/MailingList/MailingList.tsx';
import TicketModal from '../marketing/TicketModal/TicketModal.tsx';
import MonthNav from './MonthNav.tsx';
import MonthGrid from './MonthGrid.tsx';
import ShowList from './ShowList.tsx';
import { useCompactLayout } from './useCompactLayout.ts';
import { fetchUpcomingEvents } from '../../services/events.ts';
import type { CalendarEvent } from '../../types/event.ts';
import { addMonths, dayAnchorId, eventsInMonth, groupByDay, monthLabel, monthOf, monthRange, todayISO, type YearMonth } from '../../utils/calendar.ts';
import styles from './CalendarPage.module.css';

const SITE_TITLE = 'DJKMD Legends';

export default function CalendarPage() {
  const today = useMemo(() => todayISO(), []);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today));
  const [ticketEvent, setTicketEvent] = useState<CalendarEvent | null>(null);
  const [showMailingList, setShowMailingList] = useState(false);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const compact = useCompactLayout();
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => {
    fetchUpcomingEvents()
      .then((evs) => {
        setEvents(evs);
        // Deep link: /calendar?event=<id> lands on that show's month with its
        // tickets open, the same contract as /?event= on the homepage.
        const eventId = new URLSearchParams(window.location.search).get('event');
        const match = eventId ? evs.find((e) => e.id === eventId) : undefined;
        if (match) {
          setMonth(monthOf(match.date));
          setTicketEvent(match);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const { first, last } = useMemo(() => monthRange(today, events), [today, events]);
  const byDay = useMemo(() => groupByDay(events), [events]);
  const monthShows = useMemo(() => eventsInMonth(events, month), [events, month]);

  const goPrev = useCallback(() => setMonth((m) => (m > first ? addMonths(m, -1) : m)), [first]);
  const goNext = useCallback(() => setMonth((m) => (m < last ? addMonths(m, 1) : m)), [last]);

  // Arrow keys page months while nothing modal is open.
  useEffect(() => {
    if (ticketEvent || showMailingList) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(input|textarea|select)$/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goPrev, goNext, ticketEvent, showMailingList]);

  useEffect(() => {
    const previous = document.title;
    document.title = `Show Calendar · ${monthLabel(month)} | ${SITE_TITLE}`;
    return () => {
      document.title = previous;
    };
  }, [month]);

  const jumpToDay = useCallback((date: string) => {
    const target = document.getElementById(dayAnchorId(date));
    if (!target) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setHighlightDate(date);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightDate(null), 2400);
  }, []);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const total = events.length;

  return (
    <div className="app">
      <a href="#main-content" className="skipLink">
        Skip to content
      </a>
      <Header page="calendar" onOpenMailingList={() => setShowMailingList(true)} />

      <main id="main-content" className={styles.page}>
        <section className={styles.intro}>
          <Container>
            <p className={styles.eyebrow}>{SITE_TITLE}</p>
            <h1 className={styles.title}>Show Calendar</h1>
            <p className={styles.lede}>
              Every upcoming Legends show, by date.{' '}
              {compact ? 'Tap a day to see the show, then buy tickets below.' : 'Click a show to buy tickets.'}
            </p>
            {!loading && !error && total > 0 && (
              <p className={styles.count} aria-live="polite">
                {total} {total === 1 ? 'show' : 'shows'} on sale through {monthLabel(last)}
              </p>
            )}
          </Container>
        </section>

        <section id="calendar" className={styles.body}>
          <Container>
            {loading && <p className={styles.status}>Loading the calendar…</p>}

            {error && (
              <p className={styles.status}>
                Unable to load the calendar right now — please refresh, or see{' '}
                <a href="/#calendar">Upcoming Shows</a>.
              </p>
            )}

            {!loading && !error && (
              <>
                <div className={styles.panel}>
                  <MonthNav month={month} first={first} last={last} onChange={setMonth} onPrev={goPrev} onNext={goNext} />
                  <MonthGrid month={month} today={today} byDay={byDay} compact={compact} onOpen={setTicketEvent} onJumpToDay={jumpToDay} />
                  <ul className={styles.legend} aria-label="Legend">
                    <li>
                      <span className={`${styles.legendDot} ${styles.dot_onSale}`} aria-hidden="true" /> Tickets available
                    </li>
                    <li>
                      <span className={`${styles.legendDot} ${styles.dot_soldOut}`} aria-hidden="true" /> Sold out
                    </li>
                    <li>
                      <span className={`${styles.legendDot} ${styles.dot_cancelled}`} aria-hidden="true" /> Cancelled
                    </li>
                  </ul>
                </div>

                <ShowList month={month} shows={monthShows} highlightDate={highlightDate} onOpen={setTicketEvent} />
              </>
            )}
          </Container>
        </section>
      </main>

      <Footer />

      {ticketEvent && <TicketModal selectedEvent={ticketEvent} onClose={() => setTicketEvent(null)} />}
      {showMailingList && <MailingList onClose={() => setShowMailingList(false)} />}
    </div>
  );
}
