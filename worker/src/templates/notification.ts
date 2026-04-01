import type { BookingInquiry } from '../types.ts';

export function buildNotificationEmail(inquiry: BookingInquiry): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `New Booking Inquiry — ${inquiry.name} — ${inquiry.date}`;

  const fields: [string, string | undefined][] = [
    ['Name', inquiry.name],
    ['Email', inquiry.email],
    ['Phone', inquiry.phone],
    ['Event Date', inquiry.date],
    ['Event Type', inquiry.eventType],
    ['Location / Venue', inquiry.location],
    ['Message', inquiry.message],
  ];

  const presentFields = fields.filter(([, value]) => value);

  const text = presentFields.map(([label, value]) => `${label}: ${value}`).join('\n');

  const rows = presentFields
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 12px;font-weight:600;vertical-align:top;color:#bfb5a3;white-space:nowrap;">${label}</td>
          <td style="padding:8px 12px;color:#f5f0e6;">${escapeHtml(value!)}</td>
        </tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#0b0a0f;color:#f5f0e6;font-family:sans-serif;">
  <h2 style="color:#d4af37;margin:0 0 16px;">New Booking Inquiry</h2>
  <table style="border-collapse:collapse;width:100%;max-width:600px;">
    ${rows}
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
