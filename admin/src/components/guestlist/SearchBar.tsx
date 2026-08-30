import styles from './SearchBar.module.css';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className={styles.wrap}>
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by name…"
        aria-label="Search by name"
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
