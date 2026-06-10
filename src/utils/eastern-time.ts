/**
 * Convert a `datetime-local` value ("YYYY-MM-DDTHH:MM") to an ISO 8601 string
 * with the America/New_York offset for that date (EDT -04:00 / EST -05:00).
 */
export function toEasternIso(local: string): string {
  const [datePart] = local.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  }).formatToParts(probe);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-05:00';
  const offset = tz.replace('GMT', '') || '-05:00';
  return `${local}:00${offset}`;
}

/**
 * Inverse of `toEasternIso` for form pre-fill: take a stored ISO-with-offset
 * string and return the wall-clock "YYYY-MM-DDTHH:MM" a `datetime-local` input
 * expects. The stored value already carries ET wall-clock parts, so we just
 * slice them off.
 */
export function easternIsoToLocalInput(iso: string): string {
  return iso.slice(0, 16);
}
