import type { Party, TicketVariation } from '../../types/guestlist.ts';
import styles from './PartyRow.module.css';

interface PartyRowProps {
  party: Party;
  /** How many of the party are here: 0, some, or all of `party.quantity`. */
  arrived: number;
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

export default function PartyRow({ party, arrived, onClick }: PartyRowProps) {
  const fullName = `${party.firstName} ${party.lastName}`.trim();
  const checkedIn = arrived >= party.quantity;
  const partly = arrived > 0 && !checkedIn;
  const cls = checkedIn ? `${styles.row} ${styles.checkedIn}` : partly ? `${styles.row} ${styles.partly}` : styles.row;
  return (
    <button type="button" className={cls} onClick={onClick}>
      <span className={styles.left}>
        {checkedIn && <span className={styles.check} aria-hidden="true">✓</span>}
        <span className={styles.name}>{fullName || party.email}</span>
        {partly && (
          <span className={styles.partlyBadge} data-testid="party-arrived">
            {arrived} of {party.quantity} here
          </span>
        )}
        {party.seatStatus === 'unassigned' ? (
          <span className={`${styles.seats} ${styles.seatsWarn}`}>needs seats</span>
        ) : party.seatLabels && party.seatLabels.length > 0 ? (
          <span className={styles.seats}>
            {party.seatLabels.join(', ')}
            {party.seatStatus === 'partial' && ' · needs more'}
          </span>
        ) : null}
      </span>
      <span className={styles.right}>
        <span className={styles.qty}>{party.quantity}×</span>
        <span className={styles.variation}>{chipLabel(party)}</span>
      </span>
    </button>
  );
}
