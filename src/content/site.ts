import type { NavItem } from '../types/site.ts';

/* ── Site identity ─────────────────────────────────────────── */

export const siteTitle = 'DJKMD Legends';
export const siteDescription =
  'Live celebrity impersonator and tribute performances for bars, restaurants, venues, and private events.';

/* ── Navigation ────────────────────────────────────────────── */

export const navItems: NavItem[] = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Acts', href: '#acts' },
  { label: 'Calendar', href: '#calendar' },
  { label: 'Book', href: '#book' },
  { label: 'Press Kit', href: '#press-kit' },
];

/* ── Hero ──────────────────────────────────────────────────── */

export const heroHeadline = 'Unforgettable Live Entertainment';
export const heroSubcopy =
  'Celebrity impersonators, tribute acts, and live performances that bring the house down — available for bars, restaurants, venues, and private events.';

/* ── About ─────────────────────────────────────────────────── */

export type AboutHeadingPart =
  | { type: 'text'; value: string }
  | { type: 'image'; src: string; alt: string };

export const aboutHeadingParts: AboutHeadingPart[] = [
  {
    type: 'image',
    src: '/assets/images/full_logo.webp',
    alt: 'DJKMD Presents Legends',
  },
];

export const aboutProductName = 'DJ KMD Presents: Legends';

export const aboutCopyParts = [
  {
    type: 'product',
    value: aboutProductName,
  },
  {
    type: 'text',
    value:
      ' delivers world-class celebrity impersonator and tribute performances to venues and events of all sizes. From intimate cocktail hours to packed house parties, our roster of talented performers brings iconic music and unforgettable entertainment to every stage.',
  },
];

export const aboutHighlights = [
  'Bars & restaurants',
  'Private parties & corporate events',
  'Festivals & outdoor venues',
  'Themed shows & holiday celebrations',
];

/* ── Booking ───────────────────────────────────────────────── */

export const bookingEmail = 'booking@djkmdlegends.com';
export const bookingIntroCopy =
  "Ready to bring the Legends experience to your venue or event? Fill out the form below and we'll be in touch.";

export const eventTypes = [
  'Bar / Restaurant',
  'Private Party',
  'Corporate Event',
  'Festival / Outdoor',
  'Holiday / Themed Event',
  'Other',
];

/* ── Media ─────────────────────────────────────────────────── */

/** @see .env.example — VITE_YOUTUBE_VIDEO_ID */
export const youtubeVideoId: string = import.meta.env.VITE_YOUTUBE_VIDEO_ID || '';
export const mediaCaption =
  'See DJKMD Legends in action — live performances that captivate any crowd.';

/* ── Tickets (placeholder) ─────────────────────────────────── */

export const ticketDefaultPrice = 25;
export const ticketCurrency = '$';
export const ticketComingSoonMessage =
  'Ticket sales coming soon! For now, please use the booking form or contact us at booking@djkmdlegends.com';

/* ── Calendar ──────────────────────────────────────────────── */

/** @see .env.example — VITE_GOOGLE_CALENDAR_PUBLIC_URL */
export const googleCalendarPublicUrl =
  import.meta.env.VITE_GOOGLE_CALENDAR_PUBLIC_URL ||
  'https://calendar.google.com/calendar/u/0/r?cid=placeholder';
export const calendarCopy = 'See where Legends is appearing next.';

/* ── Mailing list ──────────────────────────────────────────── */

/** @see .env.example — VITE_MAILING_LIST_FORM_ACTION */
export const mailingListFormAction =
  import.meta.env.VITE_MAILING_LIST_FORM_ACTION || '';
export const mailingListHeadline = 'Stay in the Loop';
export const mailingListCopy =
  'Get updates on upcoming shows, new acts, and exclusive event announcements — straight to your inbox.';

/* ── Press kit ─────────────────────────────────────────────── */

export const pressKitPath = '/assets/press-kit/press-kit.zip';
export const pressKitDescription =
  'Download our press kit for logos, performer photos, and promotional materials.';

/* ── Section IDs ───────────────────────────────────────────── */

export const sectionIds = {
  home: 'home',
  about: 'about',
  acts: 'acts',
  media: 'media',
  calendar: 'calendar',
  book: 'book',
  mailingList: 'mailing-list',
  pressKit: 'press-kit',
} as const;

