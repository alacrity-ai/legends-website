import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../types/event.ts';
import {
  addMonths,
  dayParts,
  eventsInMonth,
  formatTime12,
  groupByDay,
  monthGrid,
  monthLabel,
  monthRange,
  todayISO,
  venueShortName,
} from './calendar.ts';

const show = (date: string, time: string | null = '19:00', title = 'Show'): CalendarEvent => ({
  title,
  date,
  time,
  location: null,
  description: null,
});

describe('addMonths', () => {
  it('crosses year boundaries both ways', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-10', 14)).toBe('2027-12');
  });
});

describe('monthRange', () => {
  it('runs from this month to the farthest show', () => {
    expect(monthRange('2026-10-19', [show('2026-10-23'), show('2027-02-14'), show('2026-12-06')])).toEqual({
      first: '2026-10',
      last: '2027-02',
    });
  });
  it('is just this month with no shows, or only shows already this month', () => {
    expect(monthRange('2026-10-19', [])).toEqual({ first: '2026-10', last: '2026-10' });
    expect(monthRange('2026-10-19', [show('2026-10-25')])).toEqual({ first: '2026-10', last: '2026-10' });
  });
});

describe('monthGrid', () => {
  it('pads October 2026 (starts Thursday, 31 days) to five whole weeks', () => {
    const cells = monthGrid('2026-10', '2026-10-19');
    expect(cells).toHaveLength(35);
    expect(cells[0]).toMatchObject({ date: '2026-09-27', inMonth: false, day: 27 });
    expect(cells[4]).toMatchObject({ date: '2026-10-01', inMonth: true, day: 1, isPast: true });
    expect(cells.find((c) => c.date === '2026-10-19')).toMatchObject({ isToday: true, isPast: false });
    expect(cells.find((c) => c.date === '2026-10-20')).toMatchObject({ isToday: false, isPast: false });
    expect(cells[34]).toMatchObject({ date: '2026-10-31', inMonth: true });
  });
  it('needs six rows when a 31-day month starts on Saturday', () => {
    // May 2027 starts on a Saturday.
    expect(monthGrid('2027-05', '2026-10-19')).toHaveLength(42);
  });
  it('always starts on a Sunday and keeps rows of seven', () => {
    for (const ym of ['2026-11', '2026-12', '2027-01', '2027-02', '2028-02']) {
      const cells = monthGrid(ym, '2026-10-19');
      expect(cells.length % 7).toBe(0);
      const [y, m, d] = cells[0].date.split('-').map(Number);
      expect(new Date(y, m - 1, d).getDay()).toBe(0);
    }
  });
});

describe('eventsInMonth / groupByDay', () => {
  const events = [show('2026-12-06', '13:30', 'Rat Pack'), show('2026-11-22', '16:00', 'Divas'), show('2026-11-22', '12:00', 'Matinee'), show('2026-11-01', null, 'TBA')];
  it('filters to the month and sorts by date then time', () => {
    expect(eventsInMonth(events, '2026-11').map((e) => e.title)).toEqual(['TBA', 'Matinee', 'Divas']);
    expect(eventsInMonth(events, '2027-01')).toEqual([]);
  });
  it('groups by day with each day in time order', () => {
    const byDay = groupByDay(events);
    expect([...byDay.keys()]).toEqual(['2026-11-01', '2026-11-22', '2026-12-06']);
    expect(byDay.get('2026-11-22')!.map((e) => e.title)).toEqual(['Matinee', 'Divas']);
  });
});

describe('labels', () => {
  it('names months and days the way the site does', () => {
    expect(monthLabel('2026-11')).toBe('November 2026');
    expect(dayParts('2026-10-17')).toEqual({ weekday: 'Sat', month: 'Oct', day: 17 });
    expect(formatTime12('19:00')).toBe('7:00 PM');
    expect(formatTime12('13:30')).toBe('1:30 PM');
    expect(formatTime12('00:05')).toBe('12:05 AM');
    expect(formatTime12(null)).toBeNull();
  });
  it('shortens a venue string to its name', () => {
    expect(venueShortName('The Billerica Elks, 14 Webb Brook Rd., Billerica MA')).toBe('Billerica Elks');
    expect(venueShortName("Anthony's, 105 Canal St, Malden")).toBe("Anthony's");
    expect(venueShortName('Princeton Station')).toBe('Princeton Station');
    expect(venueShortName(null)).toBeNull();
    expect(venueShortName('  ,  ')).toBeNull();
  });
  it('formats today without timezone drift', () => {
    expect(todayISO(new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19');
    expect(todayISO(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });
});
