import { useState } from 'react';
import Section from '../../layout/Section/Section.tsx';
import Container from '../../layout/Container/Container.tsx';
import Heading from '../../shared/Heading/Heading.tsx';
import { mediaVideos, mediaCaption, sectionIds } from '../../../content/site.ts';
import styles from './Media.module.css';

/**
 * "See Us Live" — one 16:9 player with a chip switcher when there is more
 * than one video. Only the active video's iframe is mounted (keyed remount),
 * and the wrapper's aspect ratio is fixed, so switching never shifts layout.
 */
export default function Media() {
  const [active, setActive] = useState(0);
  const video = mediaVideos[active];

  if (mediaVideos.length === 0 || !video.id) return null;

  return (
    <Section id={sectionIds.media} className={styles.section}>
      <Container>
        <Heading subtitle={mediaCaption}>See Us Live</Heading>

        {mediaVideos.length > 1 && (
          <div className={styles.tabs} role="group" aria-label="Choose a video">
            {mediaVideos.map((v, i) => (
              <button
                key={v.id}
                type="button"
                className={`${styles.tab} ${i === active ? styles.tabOn : ''}`}
                aria-pressed={i === active}
                onClick={() => setActive(i)}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}

        <div className={styles.videoWrapper}>
          <iframe
            key={video.id}
            src={`https://www.youtube.com/embed/${video.id}`}
            title={video.title}
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
