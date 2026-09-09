import type { Party, TicketVariation } from '../../types/guestlist.ts';
import styles from './PartyRow.module.css';

interface PartyRowProps {
  party: Party;
  checkedIn: boolean;
  onClick: () => void;
}

function shortVariation(v: TicketVariation): string {
  if (v === 'Show and Meal') return 'Meal + Show';
  if (v === 'Show Only') return 'Show Only';
  return 'Ticket';
}

function chipLabel(party: Party): string {
  if (party.purchases.length === 0) return 'Ticket';
  if (party.purchases.length === 1) return shortVariation(party.purchases[0].variation);
  return 'Mixed';
}

export default function PartyRow({ party, checkedIn, onClick }: PartyRowProps) {
  const fullName = `${party.firstName} ${party.lastName}`.trim();
  const cls = checkedIn ? `${styles.row} ${styles.checkedIn}` : styles.row;
  return (
    <button type="button" className={cls} onClick={onClick}>
      <span className={styles.left}>
        {checkedIn && <span className={styles.check} aria-hidden="true">✓</span>}
        <span className={styles.name}>{fullName || party.email}</span>
      </span>
      <span className={styles.right}>
        <span className={styles.qty}>{party.quantity}×</span>
        <span className={styles.variation}>{chipLabel(party)}</span>
      </span>
    </button>
  );
}
