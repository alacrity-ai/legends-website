import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import Card from '../../shared/Card/Card.tsx';
import { performers } from '../../../content/performers.ts';
import { sectionIds } from '../../../content/site.ts';
import styles from './Performers.module.css';

export default function Performers() {
  return (
    <Section id={sectionIds.acts} className={styles.section}>
      <Container>
        <Heading subtitle="Meet the acts bringing legendary entertainment to your stage.">
          Our Performers
        </Heading>

        <div className={styles.grid}>
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
      </Container>
    </Section>
  );
}

