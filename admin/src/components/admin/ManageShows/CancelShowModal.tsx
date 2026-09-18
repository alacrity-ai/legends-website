import { useEffect, useState } from 'react';
import { getEventGuests, type ManagedEvent } from '../../../services/admin-events.ts';
import type { Party } from '../../../types/guestlist.ts';
import { downloadTicketHolders } from '../../../utils/ticket-holders.ts';
import confirm from './ConfirmModal.module.css';
import styles from './CancelShowModal.module.css';

interface CancelShowModalProps {
  event: ManagedEvent;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Cancelling stops sales and marks the night as off — it moves no money. The
 * modal says so, and hands staff the list of people they now owe a refund or
 * a transfer.
 */
export default function CancelShowModal({ event, busy, onConfirm, onClose }: CancelShowModalProps) {
  // undefined = still loading; null = the list could not be read.
  const [parties, setParties] = useState<Party[] | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getEventGuests(event.id)
      .then((g) => live && setParties(g.parties))
      .catch(() => live && setParties(null));
    return () => {
      live = false;
    };
  }, [event.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, busy]);

  const tickets = parties?.reduce((n, p) => n + p.quantity, 0) ?? 0;

  return (
    <div className={confirm.overlay} onClick={() => !busy && onClose()}>
      <div
        className={confirm.modal}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={confirm.icon} aria-hidden="true">!</div>
        <h2 id="cancel-title" className={confirm.title}>Cancel “{event.showName}”?</h2>
        <p className={confirm.message}>
          Ticket sales stop right away and the show is marked <strong>Cancelled</strong> here and on the website.
          You can restore it later.
        </p>

        <div className={styles.owed}>
          <p className={styles.owedLead}>
            {parties === undefined && 'Checking who holds tickets…'}
            {parties === null && 'Could not load the ticket holders — check the door list before you go on.'}
            {parties && parties.length === 0 && 'Nobody holds tickets to this show.'}
            {parties && parties.length > 0 && (
              <>
                <strong>{tickets} ticket{tickets === 1 ? '' : 's'}</strong> across {parties.length} order
                {parties.length === 1 ? '' : 's'} are still out there.
              </>
            )}
          </p>
          {parties && parties.length > 0 && (
            <>
              <ul className={styles.owedList}>
                <li>Nobody is refunded or emailed automatically. Refunds are yours to issue in Square.</li>
                <li>Let the ticket holders know, or offer to move them to another show.</li>
                <li>They stay on this show’s door list until they are refunded or moved.</li>
              </ul>
              <button type="button" className={styles.download} onClick={() => downloadTicketHolders(event, parties)}>
                Download ticket holders (names, emails, phones)
              </button>
            </>
          )}
        </div>

        <div className={confirm.actions}>
          <button type="button" className={`${confirm.btn} ${confirm.cancel}`} onClick={onClose} disabled={busy}>
            Keep show
          </button>
          <button type="button" className={`${confirm.btn} ${confirm.confirm}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Cancelling…' : 'Cancel show'}
          </button>
        </div>
      </div>
    </div>
  );
}
