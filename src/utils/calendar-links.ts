/**
 * Links that put Legends shows into someone else's calendar (LGD-41).
 *
 * Subscribing: the worker publishes an iCalendar feed at /api/calendar.ics.
 * Apple Calendar and Outlook subscribe through a `webcal://` link; Google
 * Calendar through its "add by URL" page with the feed in `cid`.
 *
 * One show: Google gets a prefilled "create event" link; everyone else gets
 * the worker's single-event .ics file.
 */
import type { CalendarEvent } from '../types/event.ts';

/** Where the feed lives, given the booking API origin the site was built with. */
export function feedUrl(apiBase: string): string {
  return `${apiBase.replace(/\/+$/, '')}/api/calendar.ics`;
}

/** `https://…/api/calendar.ics` → `webcal://…/api/calendar.ics` (Apple Calendar, Outlook). */
export function webcalUrl(feed: string): string {
  return feed.replace(/^https?:\/\//, 'webcal://');
}

/** Google Calendar's "subscribe to this URL" page, preloaded with the feed. */
export function googleSubscribeUrl(feed: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feed))}`;
}

/** The worker's one-show .ics download. */
export function eventIcsUrl(apiBase: string, eventId: string): string {
  return `${apiBase.replace(/\/+$/, '')}/api/events/${eventId}/calendar.ics`;
}

/** Shows run in Eastern time; the feed's `date`/`time` strings are already local. */
export const SHOW_TIMEZONE = 'America/New_York';

const DEFAULT_LENGTH_HOURS = 3;

/** 'YYYY-MM-DD' + 'HH:MM' → 'YYYYMMDDTHHMM00' (a floating local time for Google's template link). */
function stamp(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

/** End of a show as 'YYYY-MM-DD' + 'HH:MM'; three hours after the start when the feed gives none. */
function endOf(e: Pick<CalendarEvent, 'date' | 'time' | 'endTime'>): { date: string; time: string } {
  const start = e.time ?? '19:00';
  if (e.endTime && e.endTime > start) return { date: e.date, time: e.endTime };
  const [y, m, d] = e.date.split('-').map(Number);
  const [hh, mm] = start.split(':').map(Number);
  const end = new Date(y, m - 1, d, hh + DEFAULT_LENGTH_HOURS, mm);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`, time: `${pad(end.getHours())}:${pad(end.getMinutes())}` };
}

/** Google Calendar's prefilled "create event" page for one show. */
export function googleEventUrl(e: CalendarEvent, siteOrigin: string): string {
  const start = stamp(e.date, e.time ?? '19:00');
  const end = endOf(e);
  const showUrl = e.id ? `${siteOrigin}/calendar?event=${e.id}` : `${siteOrigin}/calendar`;
  const details = [e.description?.trim(), `Tickets: ${showUrl}`].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${e.title} — DJKMD Legends`,
    dates: `${start}/${stamp(end.date, end.time)}`,
    ctz: SHOW_TIMEZONE,
    details,
    ...(e.location ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
