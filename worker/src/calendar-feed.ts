/**
 * Public iCalendar feed of Legends shows (LGD-41).
 *
 *   GET /api/calendar.ics              every show from 30 days ago onward — the
 *                                      URL people subscribe to (webcal://, Google
 *                                      "add by URL", Outlook)
 *   GET /api/events/:id/calendar.ics   one show, as a download for "Add to calendar"
 *
 * Times are emitted in UTC (the records carry an offset), so every calendar app
 * shows the show at the right local hour. A cancelled show stays in the feed as
 * STATUS:CANCELLED with a bumped SEQUENCE, which is how subscribed calendars
 * learn to strike it rather than silently lose it.
 */
import type { EventRecord } from './types.ts';
import { escapeIcs, foldIcs, icsUtc } from './ics.ts';

export const FEED_NAME = 'DJKMD Legends Shows';
/** How long calendar apps may wait between refreshes (Apple/Outlook honour it; Google polls on its own schedule). */
const REFRESH = 'PT6H';
/** Shows that ended within this window stay in the feed so a subscriber's week does not lose last Saturday overnight. */
const KEEP_PAST_MS = 30 * 24 * 60 * 60 * 1000;

export function feedWindow(records: EventRecord[], now: number): EventRecord[] {
  return records
    .filter((r) => new Date(r.endTime).getTime() >= now - KEEP_PAST_MS)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

/** The VEVENT content lines for one show. */
export function showEventLines(r: EventRecord, origin: string, now: Date): string[] {
  const cancelled = !!r.cancelledAt;
  const showUrl = `${origin}/calendar?event=${r.id}`;
  const where = `${r.venueName}, ${r.venueAddress}`;
  const prices = r.tickets.map((t) => `${t.ticketType} $${(t.priceCents / 100).toFixed(2)}`).join(' · ');
  const status = cancelled ? 'This show has been cancelled.' : r.soldOut ? 'Sold out.' : prices ? `Tickets: ${prices}` : '';
  const description = [r.description?.trim(), status, `Tickets & details: ${showUrl}`].filter(Boolean).join('\n\n');
  return [
    'BEGIN:VEVENT',
    `UID:${r.id}@djkmdlegends.com`,
    `DTSTAMP:${icsUtc(now.toISOString())}`,
    `DTSTART:${icsUtc(r.startTime)}`,
    `DTEND:${icsUtc(r.endTime)}`,
    `SUMMARY:${escapeIcs(`${cancelled ? 'CANCELLED: ' : ''}${r.showName} — DJKMD Legends`)}`,
    `LOCATION:${escapeIcs(where)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    `URL:${escapeIcs(showUrl)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${cancelled ? 1 : 0}`,
    `LAST-MODIFIED:${icsUtc(r.cancelledAt ?? r.createdAt)}`,
    'END:VEVENT',
  ];
}

function calendarLines(body: string[], name: string): string[] {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DJKMD Legends//Show Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(name)}`,
    'X-WR-CALDESC:Upcoming live shows from DJKMD Legends. Tickets at djkmdlegends.com.',
    'X-WR-TIMEZONE:America/New_York',
    `X-PUBLISHED-TTL:${REFRESH}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${REFRESH}`,
    ...body,
    'END:VCALENDAR',
  ];
}

export function buildShowFeed(records: EventRecord[], origin: string, now = new Date()): string {
  const events = feedWindow(records, now.getTime()).flatMap((r) => showEventLines(r, origin, now));
  return foldIcs(calendarLines(events, FEED_NAME));
}

export function buildShowIcs(record: EventRecord, origin: string, now = new Date()): string {
  return foldIcs(calendarLines(showEventLines(record, origin, now), `${record.showName} — DJKMD Legends`));
}

/** "THE RAT PACK HOLIDAY SPECTACULAR" → "the-rat-pack-holiday-spectacular" for the download filename. */
export function icsFilename(showName: string): string {
  const slug = showName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'legends-show'}.ics`;
}

export function icsResponse(body: string, extraHeaders: Record<string, string>, disposition: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': disposition,
      'Cache-Control': 'public, max-age=300',
      ...extraHeaders,
    },
  });
}
