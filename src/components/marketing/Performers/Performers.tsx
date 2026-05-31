import { useRef, useCallback } from 'react';
import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import Card from '../../shared/Card/Card.tsx';
import { performers } from '../../../content/performers.ts';
import { featuredActs } from '../../../content/featured-acts.ts';
import { sectionIds } from '../../../content/site.ts';
import styles from './Performers.module.css';

export default function Performers() {
  const viewportRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((direction: 1 | -1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const firstCard = viewport.querySelector<HTMLElement>(`.${styles.card}`);
    const gap = parseFloat(getComputedStyle(viewport.firstElementChild as Element).gap) || 0;
    const amount = (firstCard?.offsetWidth ?? viewport.clientWidth * 0.8) + gap;

    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const nearEnd = viewport.scrollLeft >= maxScroll - 2;
    const nearStart = viewport.scrollLeft <= 2;

    if (direction === 1 && nearEnd) {
      /* At the end → wrap to beginning */
      viewport.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (direction === -1 && nearStart) {
      /* At the beginning → wrap to end */
      viewport.scrollTo({ left: maxScroll, behavior: 'smooth' });
    } else {
      viewport.scrollBy({ left: direction * amount, behavior: 'smooth' });
    }
  }, []);

  const handlePrevious = useCallback(() => scroll(-1), [scroll]);
  const handleNext = useCallback(() => scroll(1), [scroll]);

  return (
    <Section id={sectionIds.acts} className={styles.section}>
      <Container>
        <Heading subtitle="Meet the acts bringing legendary entertainment to your stage.">
          Our Performers
        </Heading>

        <div className={styles.carousel} role="region" aria-roledescription="carousel" aria-label="Performer carousel">
          <button className={styles.navButton} onClick={handlePrevious} aria-label="Show previous performers">
            ‹
          </button>

          <div className={styles.viewport} ref={viewportRef}>
            <div className={styles.track}>
              {performers.map((performer) => (
                <Card key={performer.id} className={styles.card}>
                  <div className={styles.imageWrapper}>
                    <img
                      src={performer.imageSrc}
                      alt={performer.imageAlt}
                      className={styles.image}
                      loading="lazy"
                    />
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.name}>{performer.name}</h3>
                    <p className={styles.description}>
                      {performer.shortDescription}
                    </p>
                    {performer.tags && performer.tags.length > 0 && (
                      <ul className={styles.tags}>
                        {performer.tags.map((tag) => (
                          <li key={tag} className={styles.tag}>
                            {tag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <button className={styles.navButton} onClick={handleNext} aria-label="Show next performers">
            ›
          </button>
        </div>

        {/* Mobile-only centered nav row */}
        <div className={styles.navRow}>
          <button className={styles.navRowButton} onClick={handlePrevious} aria-label="Show previous performers">
            ‹
          </button>
          <button className={styles.navRowButton} onClick={handleNext} aria-label="Show next performers">
            ›
          </button>
        </div>

        {featuredActs.length > 0 && (
          <div className={styles.featured}>
            <h3 className={styles.featuredHeading}>Featured Acts</h3>
            <div className={styles.featuredGrid}>
              {featuredActs.map((act) => (
                <a key={act.id} href={act.href} className={styles.featuredCard}>
                  <div className={styles.featuredImageWrapper}>
                    <img
                      src={act.imageSrc}
                      alt={act.imageAlt}
                      className={styles.featuredImage}
                      loading="lazy"
                    />
                  </div>
                  <div className={styles.featuredBody}>
                    <h4 className={styles.featuredName}>{act.name}</h4>
                    <p className={styles.featuredBlurb}>{act.blurb}</p>
                    <span className={styles.featuredLink}>Explore this act &rarr;</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </Container>
    </Section>
  );
}

