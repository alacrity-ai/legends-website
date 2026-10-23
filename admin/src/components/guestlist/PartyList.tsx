import type { ArrivedMap, Party } from '../../types/guestlist.ts';
import PartyRow from './PartyRow.tsx';
import styles from './PartyList.module.css';

interface PartyListProps {
  parties: Party[];
  /** How many of each party are here (see arrivalCounts). */
  arrivals: ArrivedMap;
  onSelect: (party: Party) => void;
}

export default function PartyList({ parties, arrivals, onSelect }: PartyListProps) {
  if (parties.length === 0) {
    return <p className={styles.empty}>No matches.</p>;
  }
  return (
    <ul className={styles.list}>
      {parties.map((party) => (
        <li key={party.id}>
          <PartyRow
            party={party}
            arrived={arrivals[party.id] ?? 0}
            onClick={() => onSelect(party)}
          />
        </li>
      ))}
    </ul>
  );
}
