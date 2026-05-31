import { useEffect, useCallback } from 'react';
import type { CalendarEvent } from '../../../types/event.ts';
import { ticketComingSoonMessage } from '../../../content/site.ts';
import { parseDescription } from '../../../utils/parse-description.ts';
import styles from './TicketModal.module.css';

interface TicketModalProps {
  selectedEvent: CalendarEvent;
  onClose: () => void;
}

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
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

  // v0.2 form-created events carry structured tickets. Legacy calendar events
  // still encode a single Square link inside the description.
  const hasTickets = !!selectedEvent.tickets && selectedEvent.tickets.length > 0;
  const { text, squareUrl } = hasTickets
    ? { text: selectedEvent.description, squareUrl: null }
    : parseDescription(selectedEvent.description);

  const imageSrc = selectedEvent.imageUrl
    ? `${import.meta.env.VITE_BOOKING_API_URL}${selectedEvent.imageUrl}`
    : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Get Tickets">
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>

        {imageSrc && (
          <img className={styles.image} src={imageSrc} alt={`${selectedEvent.title} promotional image`} />
        )}

        <h2 className={styles.heading}>{selectedEvent.title}</h2>

        {text && <p className={styles.description}>{text}</p>}

        {hasTickets ? (
          <div className={styles.ticketButtons}>
            {selectedEvent.tickets!.map((ticket) => (
              <a
                key={ticket.ticketType}
                href={`${ticket.checkoutUrl}?src=embed`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.buyNowLink}
                onClick={onClose}
              >
                {ticket.ticketType} — {formatPrice(ticket.priceCents)}
              </a>
            ))}
          </div>
        ) : squareUrl ? (
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
