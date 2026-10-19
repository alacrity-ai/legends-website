import { addMonths, monthLabel, type YearMonth } from '../../utils/calendar.ts';
import styles from './CalendarPage.module.css';

interface MonthNavProps {
  month: YearMonth;
  first: YearMonth;
  last: YearMonth;
  onChange: (next: YearMonth) => void;
  onPrev: () => void;
  onNext: () => void;
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'left' ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

export default function MonthNav({ month, first, last, onChange, onPrev, onNext }: MonthNavProps) {
  const atFirst = month <= first;
  const atLast = month >= last;
  return (
    <div className={styles.monthNav}>
      <button
        type="button"
        className={styles.navButton}
        onClick={onPrev}
        disabled={atFirst}
        aria-label={atFirst ? 'Earlier months are not shown' : `Previous month, ${monthLabel(addMonths(month, -1))}`}
      >
        <Chevron dir="left" />
      </button>

      <div className={styles.monthTitleWrap}>
        <h2 className={styles.monthTitle} aria-live="polite">
          {monthLabel(month)}
        </h2>
        {month !== first && (
          <button type="button" className={styles.todayLink} onClick={() => onChange(first)}>
            Back to this month
          </button>
        )}
      </div>

      <button
        type="button"
        className={styles.navButton}
        onClick={onNext}
        disabled={atLast}
        aria-label={atLast ? 'No shows scheduled beyond this month yet' : `Next month, ${monthLabel(addMonths(month, 1))}`}
      >
        <Chevron dir="right" />
      </button>
    </div>
  );
}
