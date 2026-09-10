import { useEffect, useState } from 'react';
import type { Party, TicketVariation } from '../../types/guestlist.ts';
import styles from './CheckInModal.module.css';

interface CheckInModalProps {
  party: Party;
  checkedInAt: string | null;
  onClose: () => void;
  onCheckIn: () => Promise<void> | void;
  onUncheck: () => Promise<void> | void;
  /** Reserved-seating shows: open the seat picker for this party. */
  onChangeSeats?: () => void;
  /** Re-send the buyer's confirmation email (only offered when the party has an email). */
  onResendConfirmation?: () => Promise<void>;
}

function variationLabel(v: TicketVariation): string {
  if (v === 'Show and Meal') return 'Meal + Show';
  if (v === 'Show Only') return 'Show Only';
  return 'Ticket';
}

function formatDateTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
  onChangeSeats,
  onResendConfirmation,
}: CheckInModalProps) {
  const [busy, setBusy] = useState(false);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendError, setResendError] = useState<string | null>(null);
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

  const handleResend = async () => {
    if (!onResendConfirmation || busy || resend === 'sending') return;
    setResend('sending');
    setResendError(null);
    try {
      await onResendConfirmation();
      setResend('sent');
    } catch (err) {
      setResend('failed');
      setResendError(err instanceof Error ? err.message : 'Could not send the email.');
    }
  };

  const headlineLabel = party.quantity === 1 ? 'ticket' : 'tickets';
  const confirmedAt = party.confirmationSentAt ? formatDateTime(party.confirmationSentAt) : null;

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

        {party.seatStatus && (
          <p className={party.seatStatus === 'assigned' ? styles.seatsLine : `${styles.seatsLine} ${styles.seatsWarn}`} data-testid="party-seats">
            {party.seatStatus === 'unassigned'
              ? 'No seats assigned yet'
              : `Seats: ${(party.seatLabels ?? []).join(', ')}`}
            {party.seatStatus === 'partial' && ` — needs ${party.quantity - (party.seats?.length ?? 0)} more`}
          </p>
        )}

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
          {party.email && (
            <>
              <dt>Confirmation</dt>
              <dd data-testid="party-confirmation">{resend === 'sent' ? 'Sent just now' : confirmedAt ? `Emailed ${confirmedAt}` : 'Not emailed yet'}</dd>
            </>
          )}
        </dl>

        {resendError && (
          <p className={styles.error} role="alert">
            {resendError}
          </p>
        )}

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
          {onChangeSeats && (
            <button type="button" className={`${styles.button} ${styles.cancel}`} onClick={onChangeSeats} disabled={busy}>
              {party.seatStatus === 'unassigned' || !party.seats?.length ? 'Assign seats' : 'Change seats'}
            </button>
          )}
          {onResendConfirmation && party.email && (
            <button type="button" className={`${styles.button} ${styles.cancel}`} onClick={() => void handleResend()} disabled={busy || resend === 'sending'}>
              {resend === 'sending' ? 'Sending…' : resend === 'sent' ? 'Confirmation sent ✓' : 'Resend confirmation email'}
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
