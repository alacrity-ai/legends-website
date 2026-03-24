import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import {
  youtubeVideoId,
  mediaCaption,
  sectionIds,
} from '../../../content/site.ts';
import styles from './Media.module.css';

export default function Media() {
  const embedUrl = `https://www.youtube.com/embed/${youtubeVideoId}`;

  return (
    <Section id={sectionIds.media} className={styles.section}>
      <Container>
        <Heading subtitle={mediaCaption}>See Us Live</Heading>

        <div className={styles.videoWrapper}>
          <iframe
            src={embedUrl}
            title="DJKMD Legends performance video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.iframe}
            loading="lazy"
          />
        </div>
      </Container>
    </Section>
  );
}

