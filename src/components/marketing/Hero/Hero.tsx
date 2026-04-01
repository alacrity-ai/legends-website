import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Button from '../../shared/Button/Button.tsx';
import {
  heroHeadline,
  heroSubcopy,
  sectionIds,
} from '../../../content/site.ts';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <Section id={sectionIds.home} className={styles.hero}>
      <Container>
        <div className={styles.content}>
          <h1 className={styles.headline}>{heroHeadline}</h1>
          <p className={styles.subcopy}>{heroSubcopy}</p>

          <div className={styles.ctas}>
            <Button href={`#${sectionIds.book}`} variant="primary">
              Book Now
            </Button>
            <Button href={`#${sectionIds.calendar}`} variant="primary">
              See Upcoming Shows
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}

