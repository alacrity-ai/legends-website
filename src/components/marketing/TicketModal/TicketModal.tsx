import { useState, useEffect, useCallback } from 'react';
import type { CalendarEvent } from '../../../types/event.ts';
import {
  ticketDefaultPrice,
  ticketCurrency,
  ticketComingSoonMessage,
} from '../../../content/site.ts';
import styles from './TicketModal.module.css';

interface TicketModalProps {
  events: CalendarEvent[];
  selectedEvent: CalendarEvent;
  onClose: () => void;
}

function formatEventOption(event: CalendarEvent): string {
  const [year, month, day] = event.date.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${event.title} — ${formatted}`;
}

export default function TicketModal({ events, selectedEvent, onClose }: TicketModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(() =>
    events.findIndex((e) => e.date === selectedEvent.date && e.title === selectedEvent.title),
  );
  const [quantity, setQuantity] = useState(1);
  const [purchased, setPurchased] = useState(false);

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

  const total = quantity * ticketDefaultPrice;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Get Tickets">
        <button className={styles.closeButton} onClick={onClose} aria-label="Close">
          &times;
        </button>

        <h2 className={styles.heading}>Get Tickets</h2>

        {purchased ? (
          <div className={styles.comingSoon}>
            <p>{ticketComingSoonMessage}</p>
            <button className={styles.dismissButton} onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div className={styles.fieldGroup}>
              <label htmlFor="ticket-event" className={styles.label}>Event</label>
              <select
                id="ticket-event"
                className={styles.input}
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
              >
                {events.map((event, i) => (
                  <option key={`${event.date}-${i}`} value={i}>
                    {formatEventOption(event)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="ticket-quantity" className={styles.label}>Quantity</label>
              <select
                id="ticket-quantity"
                className={styles.input}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className={styles.priceRow}>
              <span>Price per ticket</span>
              <span className={styles.priceValue}>{ticketCurrency}{ticketDefaultPrice.toFixed(2)}</span>
            </div>

            <div className={styles.totalRow}>
              <span>Total</span>
              <span className={styles.totalValue}>{ticketCurrency}{total.toFixed(2)}</span>
            </div>

            <p className={styles.priceNote}>(Final pricing TBD)</p>

            <button className={styles.purchaseButton} onClick={() => setPurchased(true)}>
              Purchase
            </button>
          </>
        )}
      </div>
    </div>
  );
}
