import Button from '../shared/Button/Button.tsx';
import type { CalendarEvent } from '../../types/event.ts';
import { dayAnchorId, dayParts, formatTime12, longDate, monthLabel, type YearMonth } from '../../utils/calendar.ts';
import { eventImageSrc } from '../../utils/event-image.ts';
import { eventIcsUrl, googleEventUrl } from '../../utils/calendar-links.ts';
import AddToCalendarMenu from './AddToCalendarMenu.tsx';
import styles from './CalendarPage.module.css';

const API_BASE = import.meta.env.VITE_BOOKING_API_URL as string;

interface ShowListProps {
  month: YearMonth;
  shows: CalendarEvent[];
  /** Card currently highlighted after a tap on the grid. */
  highlightDate: string | null;
  onOpen: (event: CalendarEvent) => void;
}

export default function ShowList({ month, shows, highlightDate, onOpen }: ShowListProps) {
  if (shows.length === 0) {
    return (
      <div className={styles.emptyMonth}>
        <p className={styles.emptyTitle}>No shows in {monthLabel(month)} yet</p>
        <p className={styles.emptyCopy}>
          New dates are added as they are booked. Want Legends at your venue or event?
        </p>
        <Button href="/#book" variant="secondary">
          Book Us!
        </Button>
      </div>
    );
  }

  return (
    <section className={styles.list} aria-labelledby="shows-this-month">
      <h3 id="shows-this-month" className={styles.listTitle}>
        Shows in {monthLabel(month)}
      </h3>
      <ul className={styles.cards}>
        {shows.map((e, i) => {
          const firstOfDay = i === 0 || shows[i - 1].date !== e.date;
          const { weekday, month: mon, day } = dayParts(e.date);
          const time = formatTime12(e.time);
          const image = eventImageSrc(e);
          const status = e.cancelled ? 'cancelled' : e.soldOut ? 'soldOut' : 'onSale';
          const cardClass = [styles.card, styles[`card_${status}`], highlightDate === e.date && styles.cardHighlight].filter(Boolean).join(' ');
          return (
            <li key={e.id ?? `${e.date}-${i}`} id={firstOfDay ? dayAnchorId(e.date) : undefined} className={cardClass} data-show={e.id}>
              <div className={styles.dateBadge} aria-hidden="true">
                <span className={styles.badgeWeekday}>{weekday}</span>
                <span className={styles.badgeDay}>{day}</span>
                <span className={styles.badgeMonth}>{mon}</span>
              </div>

              {image && (
                <img
                  src={image}
                  alt=""
                  className={styles.cardImage}
                  loading="lazy"
                  onError={(ev) => {
                    ev.currentTarget.style.display = 'none';
                  }}
                />
              )}

              <div className={styles.cardBody}>
                <h4 className={styles.cardTitle}>
                  {e.title}
                  {status !== 'onSale' && (
                    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>{status === 'cancelled' ? 'Cancelled' : 'Sold out'}</span>
                  )}
                </h4>
                <p className={styles.cardMeta}>
                  <span className={styles.srOnly}>{longDate(e.date)}</span>
                  {time && <span>{time}</span>}
                  {time && e.location && <span className={styles.metaDot} aria-hidden="true" />}
                  {e.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.venueLink}
                    >
                      {e.location}
                    </a>
                  )}
                </p>
                {e.id && status !== 'cancelled' && (
                  <div className={styles.cardAdd}>
                    <AddToCalendarMenu
                      label="Add to calendar"
                      ariaLabel={`Add ${e.title} to your calendar`}
                      variant="ghost"
                      choices={[
                        { label: 'Google Calendar', href: googleEventUrl(e, window.location.origin), external: true },
                        { label: 'Apple Calendar, Outlook & others', hint: 'Downloads a calendar file', href: eventIcsUrl(API_BASE, e.id), download: true },
                      ]}
                    />
                  </div>
                )}
              </div>

              <Button variant={status === 'onSale' ? 'primary' : 'secondary'} className={styles.cardButton} onClick={() => onOpen(e)}>
                {status === 'cancelled' ? 'Details' : status === 'soldOut' ? 'Sold Out' : 'Buy Tickets'}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
