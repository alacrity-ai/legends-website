import { useEffect, useCallback } from 'react';
import type { CalendarEvent } from '../../../types/event.ts';
import { ticketComingSoonMessage } from '../../../content/site.ts';
import styles from './TicketModal.module.css';

interface TicketModalProps {
  selectedEvent: CalendarEvent;
  onClose: () => void;
}

function parseDescription(html: string | null): {
  text: string | null;
  squareUrl: string | null;
} {
  if (!html) return { text: null, squareUrl: null };

  // Extract the Square link from href or text content before stripping tags
  const squareMatch = html.match(/https:\/\/square\.link\/u\/[A-Za-z0-9]+/);
  const squareUrl = squareMatch ? squareMatch[0] : null;

  // Remove the entire <a> tag (and surrounding <p>) that contains the Square link
  let cleaned = html;
  if (squareUrl) {
    cleaned = cleaned.replace(/<p>\s*<a[^>]*>https:\/\/square\.link\/u\/[A-Za-z0-9]+<\/a>\s*<\/p>/i, '');
    // Fallback: remove any remaining raw Square URLs
    cleaned = cleaned.replace(/https:\/\/square\.link\/u\/[A-Za-z0-9]+/, '');
  }

  // Convert <p> tags to newlines, strip all remaining HTML tags, decode entities
  const text = cleaned
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim() || null;

  return { text, squareUrl };
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
