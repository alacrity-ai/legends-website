import { useState, useEffect } from 'react';
import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Button from '../../shared/Button/Button.tsx';
import TicketModal from '../TicketModal/TicketModal.tsx';
import {
  heroHeadline,
  heroSubcopy,
  sectionIds,
} from '../../../content/site.ts';
import { fetchUpcomingEvents } from '../../../services/events.ts';
import { parseDescription } from '../../../utils/parse-description.ts';
import type { CalendarEvent } from '../../../types/event.ts';
import styles from './Hero.module.css';

interface HeroProps {
  onOpenMailingList: () => void;
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export default function Hero({ onOpenMailingList }: HeroProps) {
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchUpcomingEvents()
      .then((events) => {
        if (events.length > 0) setNextEvent(events[0]);
      })
      .catch(() => {});
  }, []);

  const parsed = nextEvent ? parseDescription(nextEvent.description) : null;

  return (
    <Section id={sectionIds.home} className={styles.hero}>
      <Container>
        <div className={styles.content}>
          <h1 className={styles.headline}>{heroHeadline}</h1>
          <p className={styles.subcopy}>{heroSubcopy}</p>

          {nextEvent && (
            <div className={styles.nextEvent}>
              <h2 className={styles.nextEventTitle}>{nextEvent.title}</h2>
              <p className={styles.nextEventDateTime}>
                {formatDate(nextEvent.date)}
                {nextEvent.time && <> &middot; {formatTime(nextEvent.time)}</>}
              </p>
              {nextEvent.location && (
                <p className={styles.nextEventLocation}>{nextEvent.location}</p>
              )}
              {parsed?.text && (
                <p className={styles.nextEventDescription}>{parsed.text}</p>
              )}
              {parsed?.squareUrl ? (
                <Button
                  variant="primary"
                  className={styles.nextEventButton}
                  onClick={() => {
                    window.open(`${parsed.squareUrl}?src=embed`, '_blank');
                  }}
                >
                  Buy Tickets!
                </Button>
              ) : (
                <Button
                  variant="primary"
                  className={styles.nextEventButton}
                  onClick={() => setShowModal(true)}
                >
                  Buy Tickets!
                </Button>
              )}
            </div>
          )}

          <div className={styles.ctas}>
            <Button href={`#${sectionIds.book}`} variant="primary">
              Book Us!
            </Button>
            <Button href={`#${sectionIds.calendar}`} variant="primary">
              Upcoming Shows
            </Button>
            <Button variant="secondary" onClick={onOpenMailingList}>
              Join Mailing List
            </Button>
          </div>
        </div>

        {showModal && nextEvent && (
          <TicketModal
            selectedEvent={nextEvent}
            onClose={() => setShowModal(false)}
          />
        )}
      </Container>
    </Section>
  );
}
