/**
 * The buyer's real receipt for the night (LGD-24). Square's own receipt only
 * knows our single Location, so this email carries what a buyer actually needs:
 * where and when, what they bought, where they sit, and how the door works.
 * Plain text + HTML + an .ics calendar file.
 */
import type { EventRecord, PartyRecord } from '../types.ts';

export interface TicketConfirmationInput {
  event: EventRecord;
  party: PartyRecord;
  /** Human date/time, e.g. "Sep 20, 2026, 8:00 PM" (the caller owns date formatting). */
  when: string;
  /** Public site origin for the show link, e.g. https://djkmdlegends.com */
  origin: string;
  /** "Table 2, seats 1–2" when the party's seats are assigned; null otherwise. */
  seatSummary: string | null;
}

export interface TicketConfirmationEmail {
  subject: string;
  text: string;
  html: string;
  /** iCalendar file body for the attachment. */
  ics: string;
}

export function buildTicketConfirmationEmail(input: TicketConfirmationInput): TicketConfirmationEmail {
  const { event, party, when, origin, seatSummary } = input;
  const name = `${party.firstName} ${party.lastName}`.trim();
  const greeting = party.firstName ? `Hi ${party.firstName},` : 'Hi there,';
  const where = `${event.venueName}, ${event.venueAddress}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
  const showUrl = `${origin}/?event=${event.id}`;
  const tickets = `${party.quantity} × ${party.ticketType}`;
  const total = party.amountCents != null ? `$${(party.amountCents / 100).toFixed(2)}` : null;
  const seating = !event.seating
    ? 'Seating is general admission — first come, first served.'
    : party.seatStatus === 'assigned' && seatSummary
      ? `Your seats: ${seatSummary}.`
      : 'Our staff will seat your party when you arrive — just give your name at the door.';
  const door = name ? `give the name "${name}" — nothing to print.` : 'give your name — nothing to print.';

  const subject = `Your tickets: ${event.showName} — ${when}`;

  const text = `${greeting}

You're in! Here are the details for your night with DJKMD Legends.

SHOW     ${event.showName}
WHEN     ${when}
WHERE    ${event.venueName}
         ${event.venueAddress}
         Map: ${mapsUrl}
TICKETS  ${tickets}${total ? `\n         Total paid: ${total}` : ''}
SEATS    ${seating}

At the door: ${door}
Payment reference: ${party.paymentId} (Square)
Show page: ${showUrl}

A calendar file is attached so the night lands on your phone. Questions? Just reply to this email.

— DJKMD Legends`;

  const row = (label: string, value: string) => `<tr>
          <td style="padding:8px 14px 8px 0;font-weight:600;vertical-align:top;color:#bfb5a3;white-space:nowrap;">${label}</td>
          <td style="padding:8px 0;color:#f5f0e6;line-height:1.5;">${value}</td>
        </tr>`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#0b0a0f;font-family:sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <h1 style="color:#d4af37;font-size:24px;margin:0 0 8px;">DJKMD Legends</h1>
    <p style="color:#f5f0e6;font-size:16px;line-height:1.6;margin:0 0 24px;">
      ${escapeHtml(greeting)}<br><br>
      You're in! Here are the details for your night.
    </p>

    <table style="border-collapse:collapse;width:100%;">
      ${row('Show', `<strong style="font-size:18px;">${escapeHtml(event.showName)}</strong>`)}
      ${row('When', escapeHtml(when))}
      ${row('Where', `${escapeHtml(event.venueName)}<br>${escapeHtml(event.venueAddress)}<br><a href="${escapeAttr(mapsUrl)}" style="color:#d4af37;">Open in Google Maps</a>`)}
      ${row('Tickets', `${escapeHtml(tickets)}${total ? `<br>Total paid: ${escapeHtml(total)}` : ''}`)}
      ${row('Seats', escapeHtml(seating))}
    </table>

    <p style="margin:24px 0 0;">
      <a href="${escapeAttr(mapsUrl)}" style="display:inline-block;background:#d4af37;color:#0b0a0f;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;">Open in Google Maps</a>
    </p>

    <p style="color:#f5f0e6;font-size:16px;line-height:1.6;margin:24px 0 0;">
      <strong>At the door:</strong> ${escapeHtml(door)}
    </p>
    <p style="color:#bfb5a3;font-size:13px;line-height:1.6;margin:16px 0 0;">
      Payment reference: ${escapeHtml(party.paymentId)} (Square)<br>
      Show page: <a href="${escapeAttr(showUrl)}" style="color:#d4af37;">${escapeHtml(showUrl)}</a><br>
      A calendar file is attached so the night lands on your phone. Questions? Just reply to this email.
    </p>
    <p style="color:#bfb5a3;font-size:14px;margin:24px 0 0;">— DJKMD Legends</p>
  </div>
</body>
</html>`;

  const ics = foldIcs([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DJKMD Legends//Tickets//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${party.paymentId}@djkmdlegends.com`,
    `DTSTAMP:${icsUtc(new Date().toISOString())}`,
    `DTSTART:${icsUtc(event.startTime)}`,
    `DTEND:${icsUtc(event.endTime)}`,
    `SUMMARY:${escapeIcs(`${event.showName} — DJKMD Legends`)}`,
    `LOCATION:${escapeIcs(where)}`,
    `DESCRIPTION:${escapeIcs(`${tickets}\n${seating}\nAt the door: ${door}\n${showUrl}`)}`,
    `URL:${escapeIcs(showUrl)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]);

  return { subject, text, html, ics };
}

/** "2026-09-20T20:00:00-04:00" → "20260921T000000Z" (calendar apps want UTC). */
function icsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545: lines longer than 75 octets continue on the next line after a space. */
function foldIcs(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    let rest = line;
    let first = true;
    while (rest.length > 0) {
      const take = first ? 73 : 72;
      out.push((first ? '' : ' ') + rest.slice(0, take));
      rest = rest.slice(take);
      first = false;
    }
  }
  return out.join('\r\n') + '\r\n';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return escapeHtml(str).replace(/'/g, '&#39;');
}
