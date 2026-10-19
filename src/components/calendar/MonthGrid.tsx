import type { CalendarEvent } from '../../types/event.ts';
import { formatTime12, longDate, monthGrid, venueShortName, type YearMonth } from '../../utils/calendar.ts';
import styles from './CalendarPage.module.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Chips shown in a desktop cell before the "+N more" link takes over. */
const MAX_CHIPS = 3;

interface MonthGridProps {
  month: YearMonth;
  today: string;
  byDay: Map<string, CalendarEvent[]>;
  /** Phones: the whole day is one tap target that jumps to the list. */
  compact: boolean;
  onOpen: (event: CalendarEvent) => void;
  onJumpToDay: (date: string) => void;
}

const statusOf = (e: CalendarEvent) => (e.cancelled ? 'cancelled' : e.soldOut ? 'soldOut' : 'onSale');
const statusText = { cancelled: 'Cancelled', soldOut: 'Sold out', onSale: 'Tickets available' } as const;

function describe(e: CalendarEvent): string {
  const bits = [e.title, formatTime12(e.time), venueShortName(e.location), e.cancelled ? 'cancelled' : e.soldOut ? 'sold out' : null];
  return bits.filter(Boolean).join(', ');
}

export default function MonthGrid({ month, today, byDay, compact, onOpen, onJumpToDay }: MonthGridProps) {
  const cells = monthGrid(month, today);

  return (
    <div className={styles.grid} role="group" aria-label="Shows by day">
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.weekday}>
            {d}
          </div>
        ))}
      </div>

      <div className={styles.days}>
        {cells.map((cell) => {
          const shows = cell.inMonth ? byDay.get(cell.date) ?? [] : [];
          const hasShows = shows.length > 0;
          const cellClass = [
            styles.day,
            !cell.inMonth && styles.dayOutside,
            cell.isPast && cell.inMonth && styles.dayPast,
            cell.isToday && styles.dayToday,
            hasShows && styles.dayHasShows,
          ]
            .filter(Boolean)
            .join(' ');

          const number = (
            <span className={styles.dayNumber} aria-hidden="true">
              {cell.day}
            </span>
          );

          // Phones: one button per day with shows → jump to its cards below.
          if (compact) {
            const label = hasShows
              ? `${longDate(cell.date)}: ${shows.length === 1 ? shows[0].title : `${shows.length} shows`}. Show details`
              : `${longDate(cell.date)}${cell.isToday ? ', today' : ''}, no shows`;
            return hasShows ? (
              <button
                key={cell.date}
                type="button"
                className={`${cellClass} ${styles.dayButton}`}
                data-date={cell.date}
                aria-label={label}
                onClick={() => onJumpToDay(cell.date)}
              >
                {number}
                <span className={styles.dots} aria-hidden="true">
                  {shows.slice(0, 3).map((e, i) => (
                    <span key={e.id ?? i} className={`${styles.dot} ${styles[`dot_${statusOf(e)}`]}`} data-show={e.id} />
                  ))}
                </span>
              </button>
            ) : (
              <div key={cell.date} className={cellClass} data-date={cell.date} aria-label={label}>
                {number}
              </div>
            );
          }

          // Desktop: the day is a cell, each show is its own button.
          const overflow = shows.length - MAX_CHIPS;
          return (
            <div
              key={cell.date}
              className={cellClass}
              data-date={cell.date}
              aria-label={`${longDate(cell.date)}${cell.isToday ? ', today' : ''}${hasShows ? '' : ', no shows'}`}
            >
              {number}
              {hasShows && (
                <ul className={styles.chips}>
                  {shows.slice(0, overflow > 1 ? MAX_CHIPS : shows.length).map((e, i) => {
                    const status = statusOf(e);
                    return (
                      <li key={e.id ?? i}>
                        <button
                          type="button"
                          className={`${styles.chip} ${styles[`chip_${status}`]}`}
                          data-show={e.id}
                          onClick={() => onOpen(e)}
                          aria-label={`${describe(e)}. Open tickets`}
                          title={`${e.title} · ${statusText[status]}`}
                        >
                          <span className={styles.chipTitle}>{e.title}</span>
                          <span className={styles.chipMeta}>
                            {[formatTime12(e.time), venueShortName(e.location)].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {overflow > 1 && (
                    <li>
                      <button type="button" className={styles.moreLink} onClick={() => onJumpToDay(cell.date)}>
                        +{overflow} more
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
