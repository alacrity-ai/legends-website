import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import {
  aboutHeadingParts,
  aboutCopyParts,
  aboutHighlights,
  sectionIds,
} from '../../../content/site.ts';
import styles from './About.module.css';

export default function About() {
  return (
    <Section id={sectionIds.about}>
      <Container>
        <Heading align="center">
          {aboutHeadingParts.map((part, index) => {
            if (part.type === 'text') {
              return <span key={index}>{part.value}</span>;
            }

            if (part.type === 'image') {
              return (
                <img
                  key={index}
                  src={part.src}
                  alt={part.alt}
                  className={styles.inlineLogo}
                />
              );
            }

            return null;
          })}
        </Heading>

        <div className={styles.body}>
          <p className={styles.copy}>
            {aboutCopyParts.map((part, index) => {
              if (part.type === 'product') {
                return (
                  <strong key={index} className={styles.productName}>
                    “{part.value}”
                  </strong>
                );
              }

              return <span key={index}>{part.value}</span>;
            })}
          </p>

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