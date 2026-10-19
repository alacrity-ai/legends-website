import { useSyncExternalStore } from 'react';

/**
 * Below this width the month grid switches from titled chips to dots with the
 * show list underneath (CalendarPage.module.css uses the same breakpoint).
 */
export const COMPACT_QUERY = '(max-width: 639px)';

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(COMPACT_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};
const getSnapshot = () => window.matchMedia(COMPACT_QUERY).matches;

/** True on phones, where a day cell is one tap target and chips are dots. */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
