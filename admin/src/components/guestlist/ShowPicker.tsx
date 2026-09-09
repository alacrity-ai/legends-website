import styles from './ShowPicker.module.css';

interface ShowPickerProps {
  shows: string[];
  selected: string | null;
  onSelect: (showId: string) => void;
}

function formatShow(id: string): string {
  const [y, m, d] = id.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return id;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ShowPicker({ shows, selected, onSelect }: ShowPickerProps) {
  if (shows.length === 1) {
    return <div className={styles.solo}>{formatShow(shows[0])}</div>;
  }
  return (
    <label className={styles.wrap}>
      <span className={styles.label}>Show</span>
      <select
        className={styles.select}
        value={selected ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        {!selected && <option value="" disabled>Pick a show…</option>}
        {shows.map((id) => (
          <option key={id} value={id}>
            {formatShow(id)}
          </option>
        ))}
      </select>
    </label>
  );
}
