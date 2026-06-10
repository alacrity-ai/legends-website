import { useEffect, useCallback, useState } from 'react';
import type { CalendarEvent } from '../../../types/event.ts';
import { ticketComingSoonMessage } from '../../../content/site.ts';
import { parseDescription } from '../../../utils/parse-description.ts';
import { eventImageSrc } from '../../../utils/event-image.ts';
import { startCheckout } from '../../../services/events.ts';
import styles from './TicketModal.module.css';

interface TicketModalProps {
  selectedEvent: CalendarEvent;
  onClose: () => void;
}

const MAX_QTY = 20;

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export default function TicketModal({ selectedEvent, onClose }: TicketModalProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyingType, setBuyingType] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

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

  // v0.2+ form-created events carry structured tickets AND an id (needed for the
  // dynamic checkout endpoint). Legacy calendar events still encode a single
  // Square link inside the description.
  const hasTickets = !!selectedEvent.id && !!selectedEvent.tickets && selectedEvent.tickets.length > 0;
  const { text, squareUrl } = hasTickets
    ? { text: selectedEvent.description, squareUrl: null }
    : parseDescription(selectedEvent.description);

  const imageSrc = eventImageSrc(selectedEvent);
  const soldOut = selectedEvent.soldOut === true;

  const qtyFor = (ticketType: string) => quantities[ticketType] ?? 1;
  const setQty = (ticketType: string, next: number) =>
    setQuantities((prev) => ({
      ...prev,
      [ticketType]: Math.min(MAX_QTY, Math.max(1, next)),
    }));

  const handleBuy = async (ticketType: string) => {
    if (!selectedEvent.id) return;
    setBuyingType(ticketType);
    setCheckoutError(null);
    try {
      const url = await startCheckout(selectedEvent.id, ticketType, qtyFor(ticketType));
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not start checkout.');
      setBuyingType(null);
    }
  };

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
          soldOut ? (
            <div className={styles.soldOut}>Sold Out</div>
          ) : (
            <div className={styles.ticketList}>
              {selectedEvent.tickets!.map((ticket) => {
                const qty = qtyFor(ticket.ticketType);
                const busy = buyingType === ticket.ticketType;
                const anyBusy = buyingType !== null;
                return (
                  <div key={ticket.ticketType} className={styles.ticketRow}>
                    <div className={styles.ticketHead}>
                      <span className={styles.ticketName}>{ticket.ticketType}</span>
                      <span className={styles.ticketUnit}>{formatPrice(ticket.priceCents)} each</span>
                    </div>
                    <div className={styles.ticketControls}>
                      <div className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepButton}
                          onClick={() => setQty(ticket.ticketType, qty - 1)}
                          disabled={qty <= 1 || anyBusy}
                          aria-label={`Decrease ${ticket.ticketType} quantity`}
                        >
                          −
                        </button>
                        <span className={styles.qty} aria-live="polite">{qty}</span>
                        <button
                          type="button"
                          className={styles.stepButton}
                          onClick={() => setQty(ticket.ticketType, qty + 1)}
                          disabled={qty >= MAX_QTY || anyBusy}
                          aria-label={`Increase ${ticket.ticketType} quantity`}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className={styles.buyButton}
                        onClick={() => void handleBuy(ticket.ticketType)}
                        disabled={anyBusy}
                      >
                        {busy ? 'Loading…' : `Buy ${qty} · ${formatPrice(ticket.priceCents * qty)}`}
                      </button>
                    </div>
                  </div>
                );
              })}
              {checkoutError && (
                <p className={styles.checkoutError} role="alert">{checkoutError}</p>
              )}
            </div>
          )
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
