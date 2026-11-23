import type { NavItem } from '../types/site.ts';

/* ── Site identity ─────────────────────────────────────────── */

export const siteTitle = 'DJKMD Legends';
export const siteDescription =
  'Live celebrity impersonator and tribute performances for bars, restaurants, venues, and private events.';

/* ── Navigation ────────────────────────────────────────────── */

export const navItems: NavItem[] = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Video', href: '#media' },
  { label: 'Acts', href: '#acts' },
  { label: 'Calendar', href: '/calendar' },
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

/**
 * Videos offered in the Media section's switcher. The first entry is the
 * default shown on load. YouTube ids are public, so they live here (the old
 * VITE_YOUTUBE_VIDEO_ID build override was retired 2026-11-23).
 */
export interface MediaVideo {
  /** YouTube video id. */
  id: string;
  /** Short chip label shown in the switcher. */
  label: string;
  /** Iframe title (accessibility). */
  title: string;
}

export const mediaVideos: MediaVideo[] = [
  // "LEGENDS PROMO" (https://youtu.be/xNO_7JohqFI) — new default, from Leif 2026-11-23.
  { id: 'xNO_7JohqFI', label: 'Legends Promo', title: 'DJKMD Legends promo video' },
  // Original promo (https://youtu.be/u_eMzaB6RXM) — supplied by Keith on 2026-08-03.
  { id: 'u_eMzaB6RXM', label: 'Promo 2', title: 'DJKMD Legends promo video (2)' },
  // "THE RAT PACK" — supplied by Keith on 2026-09-02 (LGD-11).
  { id: 'zLKgjY1znwc', label: 'The Rat Pack', title: 'The Rat Pack — live tribute performance' },
];

export const mediaCaption =
  'See DJKMD Legends in action — live performances that captivate any crowd.';

/* ── Tickets (placeholder) ─────────────────────────────────── */

export const ticketComingSoonMessage =
  'Ticket sales coming soon! For now, please use the booking form or contact us at booking@djkmdlegends.com';

/* ── Calendar ──────────────────────────────────────────────── */

export const calendarCopy = 'See where Legends is appearing next.';
export const calendarPagePath = '/calendar';

/* ── Mailing list ──────────────────────────────────────────── */

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

