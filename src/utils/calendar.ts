/**
 * Pure date helpers for the public show calendar (/calendar, LGD-40).
 *
 * Everything here works on the feed's own strings — `date` is 'YYYY-MM-DD' and
 * `time` is 'HH:MM', both Eastern as the worker emits them — so a show lands
 * on the day the venue prints on the poster, whatever the buyer's timezone.
 * Months are 'YYYY-MM' strings, which compare correctly as plain strings.
 */
import type { CalendarEvent } from '../types/event.ts';

/** 'YYYY-MM' */
export type YearMonth = string;

export interface DayCell {
  /** 'YYYY-MM-DD' of the cell (leading/trailing cells carry the neighbouring month's real date). */
  date: string;
  /** Day of month, 1–31. */
  day: number;
  /** Belongs to the month being shown (false for the padding cells either side). */
  inMonth: boolean;
  isToday: boolean;
  /** Strictly before today. */
  isPast: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Today as 'YYYY-MM-DD' in the device's local calendar. */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const monthOf = (date: string): YearMonth => date.slice(0, 7);

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/**
 * The months a visitor may page through: from the current month to the month
 * of the farthest scheduled show. With no shows the range is just this month.
 */
export function monthRange(today: string, events: ReadonlyArray<Pick<CalendarEvent, 'date'>>): { first: YearMonth; last: YearMonth } {
  const first = monthOf(today);
  let last = first;
  for (const e of events) {
    const m = monthOf(e.date);
    if (m > last) last = m;
  }
  return { first, last };
}

/** 'November 2026' */
export function monthLabel(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * The cells of a month grid, Sunday-first, padded to whole weeks with the
 * neighbouring months' days so every row has seven cells.
 */
export function monthGrid(ym: YearMonth, today: string): DayCell[] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells: DayCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(y, m - 1, 1 - lead + i);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    cells.push({
      date,
      day: d.getDate(),
      inMonth: d.getMonth() === m - 1,
      isToday: date === today,
      isPast: date < today,
    });
  }
  return cells;
}

const byDateThenTime = (a: CalendarEvent, b: CalendarEvent) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title);

/** Shows falling in one month, earliest first. */
export function eventsInMonth(events: ReadonlyArray<CalendarEvent>, ym: YearMonth): CalendarEvent[] {
  return events.filter((e) => monthOf(e.date) === ym).sort(byDateThenTime);
}

/** Shows keyed by 'YYYY-MM-DD', each day's list earliest first. */
export function groupByDay(events: ReadonlyArray<CalendarEvent>): Map<string, CalendarEvent[]> {
  const out = new Map<string, CalendarEvent[]>();
  for (const e of [...events].sort(byDateThenTime)) {
    const list = out.get(e.date);
    if (list) list.push(e);
    else out.set(e.date, [e]);
  }
  return out;
}

/**
 * The part of a venue string that fits on a calendar chip: the text before
 * the first comma, without a leading "The". "The Billerica Elks, 14 Webb
 * Brook Rd., Billerica MA" → "Billerica Elks".
 */
export function venueShortName(location: string | null | undefined): string | null {
  if (!location) return null;
  const head = location.split(',')[0].trim().replace(/^the\s+/i, '');
  return head || null;
}

/** '19:00' → '7:00 PM'; null stays null. */
export function formatTime12(time24: string | null | undefined): string | null {
  if (!time24) return null;
  const [h, m] = time24.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${pad(m)} ${period}`;
}

/** { weekday: 'Sat', month: 'Oct', day: 17 } for the list's date badges. */
export function dayParts(date: string): { weekday: string; month: string; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString('en-US', { weekday: 'short' }),
    month: dt.toLocaleDateString('en-US', { month: 'short' }),
    day: d,
  };
}

/** DOM id of a day's first card in the show list, the target of a tap on the grid. */
export const dayAnchorId = (date: string) => `day-${date}`;

/** 'Saturday, October 17' */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
