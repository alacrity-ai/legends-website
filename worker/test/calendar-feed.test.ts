/**
 * Public iCalendar feed (LGD-41): what Apple/Google/Outlook pull when someone
 * subscribes, and the one-show file behind "Add to calendar".
 */
import { describe, expect, it } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { ORIGIN, admin, createEvent } from './helpers.ts';

async function ics(path: string): Promise<{ status: number; headers: Headers; text: string }> {
  const res = await SELF.fetch(ORIGIN + path);
  return { status: res.status, headers: res.headers, text: await res.text() };
}

/** Unfold continuation lines so properties can be read whole. */
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, '');
const patch = (id: string, body: Record<string, unknown>) => admin(`/api/admin/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

describe('GET /api/calendar.ics', () => {
  it('lists upcoming shows as UTC VEVENTs with venue, ticket link and prices', async () => {
    const ev = await createEvent({ venueAddress: '14 Webb Brook Rd, Billerica, MA 01821' });
    const r = await ics('/api/calendar.ics');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(r.headers.get('cache-control')).toContain('max-age=300');
    expect(r.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(r.text.endsWith('END:VCALENDAR\r\n')).toBe(true);

    const body = unfold(r.text);
    expect(body).toContain('METHOD:PUBLISH');
    expect(body).toContain('X-WR-CALNAME:DJKMD Legends Shows');
    expect(body).toContain(`UID:${ev.id}@djkmdlegends.com`);
    // 2027-06-01T20:00:00-04:00 → 00:00Z next day
    expect(body).toContain('DTSTART:20270602T000000Z');
    expect(body).toContain('DTEND:20270602T030000Z');
    expect(body).toContain('SUMMARY:Summer GA Show — DJKMD Legends');
    expect(body).toContain('LOCATION:Billerica Elks\\, 14 Webb Brook Rd\\, Billerica\\, MA 01821');
    // primaryOrigin() = first ALLOWED_ORIGINS entry (the public site).
    expect(body).toContain(`URL:http://localhost:5173/calendar?event=${ev.id}`);
    expect(body).toContain('Tickets: Show Only $39.95 · Dinner + Show $59.95');
    expect(body).toContain('STATUS:CONFIRMED');
  });

  it('folds every line to 75 octets or fewer and uses CRLF throughout', async () => {
    await createEvent({ venueAddress: 'A very long venue address that goes on and on, Somewhere Far Away Town, Massachusetts 01234, United States of America' });
    const r = await ics('/api/calendar.ics');
    expect(r.text).not.toMatch(/[^\r]\n/);
    const enc = new TextEncoder();
    for (const line of r.text.split('\r\n')) expect(enc.encode(line).length, line).toBeLessThanOrEqual(75);
  });

  it('keeps a cancelled show as STATUS:CANCELLED with a bumped SEQUENCE, and drops shows long past', async () => {
    const cancelled = await createEvent();
    await patch(cancelled.id, { cancelled: true });
    // The admin API refuses past dates, so age a real record in KV instead.
    const old = await createEvent();
    await env.EVENTS.put(`event:${old.id}`, JSON.stringify({ ...old, startTime: '2024-01-01T20:00:00-05:00', endTime: '2024-01-01T23:00:00-05:00' }));
    const body = unfold((await ics('/api/calendar.ics')).text);
    const block = body.slice(body.indexOf(`UID:${cancelled.id}`), body.indexOf('END:VEVENT', body.indexOf(`UID:${cancelled.id}`)));
    expect(block).toContain('STATUS:CANCELLED');
    expect(block).toContain('SEQUENCE:1');
    expect(block).toContain('SUMMARY:CANCELLED: Summer GA Show — DJKMD Legends');
    expect(block).toContain('This show has been cancelled.');
    expect(body).not.toContain(`UID:${old.id}`);
  });

  it('answers 405 to anything but GET', async () => {
    const res = await SELF.fetch(`${ORIGIN}/api/calendar.ics`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});

describe('GET /api/events/:id/calendar.ics', () => {
  it('serves one show as a download named after it', async () => {
    const ev = await createEvent();
    const r = await ics(`/api/events/${ev.id}/calendar.ics`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/calendar; charset=utf-8');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="summer-ga-show.ics"');
    const body = unfold(r.text);
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(body).toContain(`UID:${ev.id}@djkmdlegends.com`);
    expect(body).toContain('X-WR-CALNAME:Summer GA Show — DJKMD Legends');
  });

  it('404s for an unknown show', async () => {
    const r = await ics('/api/events/00000000-0000-0000-0000-000000000000/calendar.ics');
    expect(r.status).toBe(404);
  });
});
