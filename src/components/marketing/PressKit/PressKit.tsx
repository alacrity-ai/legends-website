import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import Button from '../../shared/Button/Button.tsx';
import {
  pressKitPath,
  pressKitDescription,
  sectionIds,
} from '../../../content/site.ts';
import styles from './PressKit.module.css';

export default function PressKit() {
  return (
    <Section id={sectionIds.pressKit}>
      <Container>
        <div className={styles.wrapper}>
          <Heading subtitle={pressKitDescription}>Press Kit</Heading>

          <div className={styles.actions}>
            <Button variant="primary" href={pressKitPath} download>
              Download Press Kit (.zip)
            </Button>
          </div>

          <p className={styles.meta}>
            Includes logos, performer photos, and promotional copy.
          </p>
        </div>
      </Container>
    </Section>
  );
}

