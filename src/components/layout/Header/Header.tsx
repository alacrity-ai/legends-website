import { useState } from 'react';
import Container from '../Container/Container.tsx';
import Button from '../../shared/Button/Button.tsx';
import { siteTitle, navItems } from '../../../content/site.ts';
import styles from './Header.module.css';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavClick = () => {
    setMenuOpen(false);
  };

  return (
    <header className={styles.header}>
      <Container className={styles.inner}>
        <a href="#home" className={styles.wordmark}>
          {siteTitle}
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
                    href={item.href}
                    className={styles.navLink}
                    onClick={handleNavClick}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
          </ul>

          <Button href="#book" variant="primary" onClick={handleNavClick}>
            Book Now
          </Button>
        </nav>
      </Container>
    </header>
  );
}

