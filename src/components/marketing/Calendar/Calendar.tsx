import { useState, useEffect } from 'react';
import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import Button from '../../shared/Button/Button.tsx';
import TicketModal from '../TicketModal/TicketModal.tsx';
import {
  googleCalendarPublicUrl,
  calendarCopy,
  sectionIds,
} from '../../../content/site.ts';
import { fetchUpcomingEvents } from '../../../services/events.ts';
import type { CalendarEvent } from '../../../types/event.ts';
import styles from './Calendar.module.css';

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ticketEvent, setTicketEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    fetchUpcomingEvents()
      .then(setEvents)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Section id={sectionIds.calendar}>
      <Container>
        <Heading subtitle={calendarCopy}>Upcoming Shows</Heading>

        {loading && (
          <p className={styles.statusText}>Loading upcoming shows...</p>
        )}

        {error && (
          <div className={styles.statusText}>
            <p>Unable to load upcoming shows.</p>
            <a
              href={googleCalendarPublicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.fallbackLink}
            >
              View calendar &rarr;
            </a>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <p className={styles.statusText}>No upcoming shows — check back soon!</p>
        )}

        {!loading && !error && events.length > 0 && (
          <div className={styles.eventList}>
            {events.map((event, i) => (
              <article key={event.id ?? `${event.date}-${i}`} className={styles.eventCard}>
                {event.imageUrl && (
                  <img
                    src={`${import.meta.env.VITE_BOOKING_API_URL}${event.imageUrl}`}
                    alt={`${event.title} promotional image`}
                    className={styles.eventImage}
                    loading="lazy"
                  />
                )}
                <h3 className={styles.eventTitle}>{event.title}</h3>
                <p className={styles.eventDateTime}>
                  {formatDate(event.date)}
                  {event.time && <> &middot; {formatTime(event.time)}</>}
                </p>
                {event.location && (
                  <p className={styles.eventLocation}>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.locationLink}
                    >
                      {event.location}
                    </a>
                  </p>
                )}
                <Button
                  variant="primary"
                  className={styles.cardButton}
                  onClick={() => setTicketEvent(event)}
                >
                  Buy Tickets
                </Button>
              </article>
            ))}
          </div>
        )}
        {ticketEvent && (
          <TicketModal
            selectedEvent={ticketEvent}
            onClose={() => setTicketEvent(null)}
          />
        )}
      </Container>
    </Section>
  );
}
