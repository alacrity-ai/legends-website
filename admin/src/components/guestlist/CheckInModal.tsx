import { useEffect, useState } from 'react';
import type { Party, TicketVariation } from '../../types/guestlist.ts';
import styles from './CheckInModal.module.css';

interface CheckInModalProps {
  party: Party;
  /** When the party's first guest checked in; null = nobody yet. */
  checkedInAt: string | null;
  /** How many of the party are here. Defaults to all of it once checked in. */
  arrived?: number;
  /** Offer "some of the party is here" (event rosters; legacy CSV rosters are all-or-nothing). */
  canCheckInSome?: boolean;
  onClose: () => void;
  /** `count` = how many of the party are here in total after this; undefined = the whole party. */
  onCheckIn: (count?: number) => Promise<void> | void;
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
  arrived,
  canCheckInSome = false,
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
  const total = party.quantity;
  const here = checkedInAt ? Math.min(arrived ?? total, total) : 0;
  const remaining = total - here;
  const allHere = Boolean(checkedInAt) && remaining <= 0;
  const partlyHere = here > 0 && !allHere;
  // How many are walking in now. Starts at everyone still expected, so the
  // usual whole-party check-in stays one tap.
  const [picked, setPicked] = useState(Math.max(1, remaining));
  // Another phone can check some of them in while this is open: never offer more than are still expected.
  const arriving = Math.min(picked, Math.max(1, remaining));
  const showStepper = canCheckInSome && remaining > 1;

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

  const run = async (action: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const handleCheckIn = () => run(() => onCheckIn(canCheckInSome ? here + arriving : undefined));
  const handleUndo = () => run(onUncheck);

  const checkInLabel =
    here > 0 ? `Check in ${arriving} more`
    : arriving < total ? `Check in ${arriving} of ${total}`
    : `Check in ${fullName}`;

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

        {allHere && checkedTime && (
          <p className={styles.status}>
            Checked in at <strong>{checkedTime}</strong>.
          </p>
        )}
        {partlyHere && (
          <p className={`${styles.status} ${styles.statusPartly}`} data-testid="party-arrived-status">
            <strong>{here} of {total}</strong> here{checkedTime ? ` · first arrived ${checkedTime}` : ''}.
          </p>
        )}

        {showStepper && (
          <div className={styles.stepper}>
            <span className={styles.stepperLabel}>{here > 0 ? 'Arriving now' : 'How many are here?'}</span>
            <div className={styles.stepperControls}>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => setPicked(Math.max(1, arriving - 1))}
                disabled={busy || arriving <= 1}
                aria-label="One fewer"
              >
                −
              </button>
              <output className={styles.stepperValue} aria-live="polite" data-testid="arriving-count">
                {arriving}
              </output>
              <button
                type="button"
                className={styles.stepperButton}
                onClick={() => setPicked(Math.min(remaining, arriving + 1))}
                disabled={busy || arriving >= remaining}
                aria-label="One more"
              >
                +
              </button>
              <span className={styles.stepperOf}>of {remaining}{here > 0 ? ' still expected' : ''}</span>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          {!allHere && (
            <button
              type="button"
              className={`${styles.button} ${styles.primary}`}
              onClick={() => void handleCheckIn()}
              disabled={busy}
            >
              {busy ? 'Checking in…' : checkInLabel}
            </button>
          )}
          {checkedInAt && (
            <button
              type="button"
              className={`${styles.button} ${styles.undo}`}
              onClick={() => void handleUndo()}
              disabled={busy}
            >
              {busy ? 'Working…' : 'Undo check-in'}
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
