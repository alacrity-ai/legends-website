import type { CalendarEvent } from '../types/event.ts';

/**
 * One-off hard-coded images for two grandfathered shows imported via the
 * deprecated Google Calendar flow (they have no uploaded image). Remove these
 * entries once the shows have passed / the legacy calendar path is retired.
 */
const LEGACY_IMAGES: Array<{ date: string; src: string }> = [
  { date: '2026-06-14', src: '/assets/images/hero.webp' }, // Legends at the Elks (Billerica)
  { date: '2026-09-20', src: '/assets/images/sinatra.jpg' }, // Sinatra/Martin/Sammy (Chelmsford)
];

/**
 * Resolve the display image for an event card / ticket modal:
 * the real (R2-served) image for form-created events, or a hard-coded
 * override for the two legacy calendar events, else null.
 */
export function eventImageSrc(event: CalendarEvent): string | null {
  if (event.imageUrl) {
    return `${import.meta.env.VITE_BOOKING_API_URL}${event.imageUrl}`;
  }
  return LEGACY_IMAGES.find((entry) => entry.date === event.date)?.src ?? null;
}
