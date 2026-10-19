/**
 * iCalendar (RFC 5545) building blocks shared by the ticket confirmation
 * attachment (LGD-24) and the public show feed (LGD-41).
 */

/** "2026-09-20T20:00:00-04:00" → "20260921T000000Z" (calendar apps want UTC). */
export function icsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** TEXT value escaping: backslash, semicolon, comma, newline. */
export function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Join content lines with CRLF, folding anything over 75 octets onto
 * continuation lines (a leading space), as RFC 5545 §3.1 requires. Folds on
 * UTF-8 byte count so a line of accented text never splits a character.
 */
export function foldIcs(lines: string[]): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  for (const line of lines) {
    let rest = line;
    let first = true;
    while (rest.length > 0) {
      const limit = first ? 75 : 74;
      let take = Math.min(rest.length, limit);
      while (take > 1 && enc.encode(rest.slice(0, take)).length > limit) take--;
      // Never split a surrogate pair.
      if (take < rest.length && /[\uD800-\uDBFF]$/.test(rest.slice(0, take))) take--;
      out.push((first ? '' : ' ') + rest.slice(0, take));
      rest = rest.slice(take);
      first = false;
    }
  }
  return out.join('\r\n') + '\r\n';
}
