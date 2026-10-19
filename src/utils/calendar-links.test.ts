import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../types/event.ts';
import { eventIcsUrl, feedUrl, googleEventUrl, googleSubscribeUrl, webcalUrl } from './calendar-links.ts';

const show: CalendarEvent = {
  id: '3d66c522-0000-4000-8000-000000000001',
  title: "80's LEGENDS",
  date: '2026-10-23',
  time: '19:00',
  endTime: '23:00',
  location: 'The Billerica Elks, 14 Webb Brook Rd., Billerica MA',
  description: 'Hop in your Delorean.\n\nTickets are $25.',
};

describe('subscribe links', () => {
  it('derive the feed, webcal and Google subscribe URLs from the API origin', () => {
    expect(feedUrl('https://djkmdlegends.com/')).toBe('https://djkmdlegends.com/api/calendar.ics');
    expect(webcalUrl('https://djkmdlegends.com/api/calendar.ics')).toBe('webcal://djkmdlegends.com/api/calendar.ics');
    expect(webcalUrl('http://localhost:8797/api/calendar.ics')).toBe('webcal://localhost:8797/api/calendar.ics');
    expect(googleSubscribeUrl('https://djkmdlegends.com/api/calendar.ics')).toBe(
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fdjkmdlegends.com%2Fapi%2Fcalendar.ics',
    );
    expect(eventIcsUrl('https://djkmdlegends.com', show.id!)).toBe(`https://djkmdlegends.com/api/events/${show.id}/calendar.ics`);
  });
});

describe('googleEventUrl', () => {
  it('prefills title, Eastern local times, venue and a ticket link', () => {
    const u = new URL(googleEventUrl(show, 'https://djkmdlegends.com'));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('text')).toBe("80's LEGENDS — DJKMD Legends");
    expect(u.searchParams.get('dates')).toBe('20261023T190000/20261023T230000');
    expect(u.searchParams.get('ctz')).toBe('America/New_York');
    expect(u.searchParams.get('location')).toBe(show.location);
    expect(u.searchParams.get('details')).toBe(`Hop in your Delorean.\n\nTickets are $25.\n\nTickets: https://djkmdlegends.com/calendar?event=${show.id}`);
  });
  it('assumes three hours when the feed has no end time, crossing midnight if needed', () => {
    expect(new URL(googleEventUrl({ ...show, endTime: null }, 'https://x')).searchParams.get('dates')).toBe('20261023T190000/20261023T220000');
    expect(new URL(googleEventUrl({ ...show, time: '22:30', endTime: null }, 'https://x')).searchParams.get('dates')).toBe('20261023T223000/20261024T013000');
  });
  it('copes with no time, no location and no id', () => {
    const u = new URL(googleEventUrl({ title: 'TBA', date: '2026-12-06', time: null, location: null, description: null }, 'https://x'));
    expect(u.searchParams.get('dates')).toBe('20261206T190000/20261206T220000');
    expect(u.searchParams.has('location')).toBe(false);
    expect(u.searchParams.get('details')).toBe('Tickets: https://x/calendar');
  });
});
