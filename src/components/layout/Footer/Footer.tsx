import Container from '../Container/Container.tsx';
import { siteTitle, bookingEmail, pressKitPath } from '../../../content/site.ts';
import { socialLinks } from '../../../content/social.ts';
import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <Container className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.siteName}>{siteTitle}</span>
          <a href={`mailto:${bookingEmail}`} className={styles.email}>
            {bookingEmail}
          </a>
        </div>

        <nav className={styles.links} aria-label="Social links">
          <ul className={styles.socialList}>
            {socialLinks.map((link) => (
              <li key={link.platform}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialLink}
                  aria-label={link.label}
                >
                  {link.platform}
                </a>
              </li>
            ))}
          </ul>

          <a href={pressKitPath} download className={styles.pressKitLink}>
            Press Kit
          </a>
        </nav>

        <p className={styles.copyright}>
          &copy; {year} {siteTitle}. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}

