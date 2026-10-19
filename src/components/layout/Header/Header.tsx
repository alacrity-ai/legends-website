import { useState } from 'react';
import Container from '../Container/Container.tsx';
import Button from '../../shared/Button/Button.tsx';
import { siteTitle, navItems, sectionIds } from '../../../content/site.ts';
import styles from './Header.module.css';

interface HeaderProps {
  onOpenMailingList: () => void;
  /** Which page the header sits on; section anchors become absolute off the homepage. */
  page?: 'home' | 'calendar';
}

export default function Header({ onOpenMailingList, page = 'home' }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // On /calendar a bare `#about` would look for a section that is not there;
  // `/#about` takes the visitor home and scrolls. `#calendar` exists on both
  // pages (the grid on /calendar, Upcoming Shows on /), so it stays relative.
  const anchor = (id: string) => (page === 'home' || id === sectionIds.calendar ? `#${id}` : `/#${id}`);
  const hrefFor = (href: string) => (href.startsWith('#') ? anchor(href.slice(1)) : href);
  const isCurrent = (href: string) => href === '/calendar' && page === 'calendar';

  const handleNavClick = () => {
    setMenuOpen(false);
  };

  return (
    <header className={styles.header}>
      <Container className={styles.inner}>
        <a href={anchor(sectionIds.home)} className={styles.wordmark}>
          <img
            src="/assets/images/logo_wide.webp"
            alt={siteTitle}
            className={styles.logo}
          />
        </a>

        <button
          className={styles.menuToggle}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          <span className={styles.menuIcon} aria-hidden="true">
            {menuOpen ? '✕' : '☰'}
          </span>
        </button>

        <nav
          className={`${styles.nav}${menuOpen ? ` ${styles.navOpen}` : ''}`}
          aria-label="Main navigation"
        >
          <ul className={styles.navList}>
            {navItems
              .filter((item) => item.href !== '#home')
              .map((item) => (
                <li key={item.href}>
                  <a
                    href={hrefFor(item.href)}
                    className={styles.navLink}
                    onClick={handleNavClick}
                    aria-current={isCurrent(item.href) ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
          </ul>

          <div className={styles.navButtons}>
            <Button href={anchor(sectionIds.calendar)} variant="primary" onClick={handleNavClick}>
              Buy Tickets!
            </Button>
            <Button variant="secondary" onClick={() => { handleNavClick(); onOpenMailingList(); }}>
              Mailing List
            </Button>
            <Button href={anchor(sectionIds.book)} variant="secondary" onClick={handleNavClick}>
              Book Us!
            </Button>
          </div>
        </nav>
      </Container>
    </header>
  );
}

