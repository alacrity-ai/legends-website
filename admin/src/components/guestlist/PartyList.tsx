import type { CheckinMap, Party } from '../../types/guestlist.ts';
import PartyRow from './PartyRow.tsx';
import styles from './PartyList.module.css';

interface PartyListProps {
  parties: Party[];
  checkedIn: CheckinMap;
  onSelect: (party: Party) => void;
}

export default function PartyList({ parties, checkedIn, onSelect }: PartyListProps) {
  if (parties.length === 0) {
    return <p className={styles.empty}>No matches.</p>;
  }
  return (
    <ul className={styles.list}>
      {parties.map((party) => (
        <li key={party.id}>
          <PartyRow
            party={party}
            checkedIn={Boolean(checkedIn[party.id])}
            onClick={() => onSelect(party)}
          />
        </li>
      ))}
    </ul>
  );
}
