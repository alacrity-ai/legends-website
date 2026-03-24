import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import {
  aboutHeading,
  aboutCopy,
  aboutHighlights,
  sectionIds,
} from '../../../content/site.ts';
import styles from './About.module.css';

export default function About() {
  return (
    <Section id={sectionIds.about}>
      <Container>
        <Heading>{aboutHeading}</Heading>
        <div className={styles.body}>
          <p className={styles.copy}>{aboutCopy}</p>

          <ul className={styles.highlights}>
            {aboutHighlights.map((item) => (
              <li key={item} className={styles.highlightItem}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}

