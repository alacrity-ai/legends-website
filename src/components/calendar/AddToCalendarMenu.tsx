/**
 * "Subscribe" / "Add to calendar" chooser (LGD-41). One button that opens a
 * small menu of calendar destinations; closes on outside click or Escape.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import CalendarIcon from '../shared/CalendarIcon/CalendarIcon.tsx';
import styles from './CalendarPage.module.css';

export interface CalendarChoice {
  label: string;
  /** Secondary line under the label. */
  hint?: string;
  href?: string;
  /** Opens in a new tab (Google's pages). Plain links (webcal://, .ics) navigate in place. */
  external?: boolean;
  download?: boolean;
  /** For the copy-link action. */
  onSelect?: () => void | Promise<void>;
}

interface AddToCalendarMenuProps {
  /** Button text. */
  label: string;
  /** Accessible name when the label alone is ambiguous ("Add to calendar" × many cards). */
  ariaLabel?: string;
  choices: CalendarChoice[];
  variant: 'primary' | 'ghost';
  /** Rendered under the choices, e.g. the raw feed URL. */
  footer?: ReactNode;
}

export default function AddToCalendarMenu({ label, ariaLabel, choices, variant, footer }: AddToCalendarMenuProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = async (c: CalendarChoice) => {
    if (c.onSelect) {
      await c.onSelect();
      setNote('Link copied');
      window.setTimeout(() => {
        setNote(null);
        setOpen(false);
      }, 1200);
      return;
    }
    setOpen(false);
  };

  return (
    <div className={styles.menuRoot} ref={root}>
      <button
        type="button"
        className={`${styles.menuButton} ${variant === 'primary' ? styles.menuButtonPrimary : styles.menuButtonGhost}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <CalendarIcon size={16} /> {label}
      </button>

      {open && (
        <div id={menuId} className={styles.menu} role="menu" aria-label={ariaLabel ?? label}>
          {choices.map((c) =>
            c.href ? (
              <a
                key={c.label}
                role="menuitem"
                className={styles.menuItem}
                href={c.href}
                {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                {...(c.download ? { download: true } : {})}
                onClick={() => choose(c)}
              >
                <span className={styles.menuItemLabel}>{c.label}</span>
                {c.hint && <span className={styles.menuItemHint}>{c.hint}</span>}
              </a>
            ) : (
              <button key={c.label} type="button" role="menuitem" className={styles.menuItem} onClick={() => choose(c)}>
                <span className={styles.menuItemLabel}>{note ?? c.label}</span>
                {c.hint && <span className={styles.menuItemHint}>{c.hint}</span>}
              </button>
            ),
          )}
          {footer && <div className={styles.menuFooter}>{footer}</div>}
        </div>
      )}
    </div>
  );
}
