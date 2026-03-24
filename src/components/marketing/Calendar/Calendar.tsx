import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import {
  googleCalendarEmbedUrl,
  googleCalendarPublicUrl,
  calendarCopy,
  sectionIds,
} from '../../../content/site.ts';
import styles from './Calendar.module.css';

export default function Calendar() {
  return (
    <Section id={sectionIds.calendar}>
      <Container>
        <Heading subtitle={calendarCopy}>Upcoming Shows</Heading>

        <div className={styles.embedWrapper}>
          <iframe
            src={googleCalendarEmbedUrl}
            title="DJKMD Legends event calendar"
            className={styles.iframe}
            loading="lazy"
          />
        </div>

        <p className={styles.fallback}>
          <a
            href={googleCalendarPublicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.fallbackLink}
          >
            Open full calendar &rarr;
          </a>
        </p>
      </Container>
    </Section>
  );
}

