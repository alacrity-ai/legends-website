import { useEffect, useCallback } from 'react';
import type { CalendarEvent } from '../../../types/event.ts';
import { ticketComingSoonMessage } from '../../../content/site.ts';
import { parseDescription } from '../../../utils/parse-description.ts';
import styles from './TicketModal.module.css';

interface TicketModalProps {
  selectedEvent: CalendarEvent;
  onClose: () => void;
}

export default function TicketModal({ selectedEvent, onClose }: TicketModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [handleEscape]);

  const { text, squareUrl } = parseDescription(selectedEvent.description);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Get Tickets">
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h2 className={styles.heading}>{selectedEvent.title}</h2>

        {text && <p className={styles.description}>{text}</p>}

        {squareUrl ? (
          <a
            href={`${squareUrl}?src=embed`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.buyNowLink}
            onClick={onClose}
          >
            Buy Now
          </a>
        ) : (
          <div className={styles.comingSoon}>
            <p>{ticketComingSoonMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
