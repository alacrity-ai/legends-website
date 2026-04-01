import type { BookingInquiry } from '../types.ts';

export function buildConfirmationEmail(inquiry: BookingInquiry): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'We got your inquiry — DJKMD Legends';

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
  const fieldSummary = presentFields.map(([label, value]) => `  ${label}: ${value}`).join('\n');

  const text = `Hi ${inquiry.name},

Thanks for reaching out to DJKMD Legends! We've received your booking inquiry and will get back to you within 24 hours.

Here's a summary of what you submitted:

${fieldSummary}

If you need to reach us sooner, email us directly at booking@djkmdlegends.com.

— The DJKMD Legends Team`;

  const rows = presentFields
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;color:#bfb5a3;white-space:nowrap;">${label}</td>
          <td style="padding:6px 0;color:#f5f0e6;">${escapeHtml(value!)}</td>
        </tr>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0b0a0f;font-family:sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <h1 style="color:#d4af37;font-size:24px;margin:0 0 8px;">DJKMD Legends</h1>
    <p style="color:#f5f0e6;font-size:16px;line-height:1.6;margin:0 0 24px;">
      Hi ${escapeHtml(inquiry.name)},<br><br>
      Thanks for reaching out! We've received your booking inquiry and will get back to you within 24 hours.
    </p>

    <h2 style="color:#d4af37;font-size:16px;margin:0 0 12px;">Your Inquiry</h2>
    <table style="border-collapse:collapse;width:100%;">
      ${rows}
    </table>

    <hr style="border:none;border-top:1px solid #2a2530;margin:24px 0;">
    <p style="color:#bfb5a3;font-size:14px;line-height:1.5;margin:0;">
      Need to reach us sooner? Email us at
      <a href="mailto:booking@djkmdlegends.com" style="color:#d4af37;">booking@djkmdlegends.com</a>
    </p>
  </div>
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
