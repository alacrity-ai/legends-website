import { useEffect, useState } from 'react';
import type { Party, TicketVariation } from '../../types/guestlist.ts';
import styles from './CheckInModal.module.css';

interface CheckInModalProps {
  party: Party;
  checkedInAt: string | null;
  onClose: () => void;
  onCheckIn: () => Promise<void> | void;
  onUncheck: () => Promise<void> | void;
}

function variationLabel(v: TicketVariation): string {
  if (v === 'Show and Meal') return 'Meal + Show';
  if (v === 'Show Only') return 'Show Only';
  return 'Ticket';
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CheckInModal({
  party,
  checkedInAt,
  onClose,
  onCheckIn,
  onUncheck,
}: CheckInModalProps) {
  const [busy, setBusy] = useState(false);
  const fullName = `${party.firstName} ${party.lastName}`.trim() || party.email;
  const checkedTime = formatTime(checkedInAt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handlePrimary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (checkedInAt) await onUncheck();
      else await onCheckIn();
    } finally {
      setBusy(false);
    }
  };

  const headlineLabel = party.quantity === 1 ? 'ticket' : 'tickets';

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose} aria-label="Close" type="button">
          ×
        </button>
        <h2 className={styles.name}>{fullName}</h2>
        <div className={styles.headline}>
          <span className={styles.qty}>{party.quantity}</span>
          <span className={styles.ticketLabel}>{headlineLabel}</span>
        </div>

        {party.notes && (
          <p className={styles.notes} role="note">
            <span className={styles.notesLabel}>Note</span>
            <span>{party.notes}</span>
          </p>
        )}

        {party.purchases.length > 0 && (
          <ul className={styles.purchases}>
            {party.purchases.map((p) => (
              <li key={p.variation}>
                <span className={styles.purchaseQty}>{p.quantity}×</span>
                <span>{variationLabel(p.variation)}</span>
              </li>
            ))}
          </ul>
        )}

        <dl className={styles.details}>
          {party.email && (
            <>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${party.email}`} className={styles.link}>{party.email}</a>
              </dd>
            </>
          )}
          {party.phone && (
            <>
              <dt>Phone</dt>
              <dd>
                <a href={`tel:${party.phone}`} className={styles.link}>{party.phone}</a>
              </dd>
            </>
          )}
          <dt>Ordered</dt>
          <dd>{party.orderDate}</dd>
        </dl>

        {checkedInAt && checkedTime && (
          <p className={styles.status}>
            Checked in at <strong>{checkedTime}</strong>.
          </p>
        )}

        <div className={styles.actions}>
          {checkedInAt ? (
            <button
              type="button"
              className={`${styles.button} ${styles.undo}`}
              onClick={handlePrimary}
              disabled={busy}
            >
              {busy ? 'Working…' : 'Undo check-in'}
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={handlePrimary}
              disabled={busy}
            >
              {busy ? 'Checking in…' : `Check in ${fullName}`}
            </button>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.cancel}`}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
