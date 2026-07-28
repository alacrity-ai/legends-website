/**
 * Branded HTML email template for DJKMD Legends mailing-list campaigns.
 * Email-client-safe: table layout, inline styles, 600px column, PNG logo,
 * system serif stack. Dark stage-and-gold look matching djkmdlegends.com.
 *
 * See docs/sops/send-mailing-list-campaign.md for the campaign spec format
 * and the design rules this file implements.
 */

const GOLD = '#d4af37';
const BG = '#0c0a12';
const CARD = '#16121f';
const BORDER = '#2a2438';
const TEXT = '#e8e4da';
const MUTED = '#b8b2a6';
const FAINT = '#8d8778';
const SERIF = "Georgia, 'Times New Roman', serif";

// TODO(Leif): replace with the real business mailing address — CAN-SPAM
// requires a valid physical postal address in every marketing email.
export const POSTAL_ADDRESS = 'DJKMD Presents Legends · Chelmsford, MA';

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "2026-08-28T16:00:00-04:00" -> "Friday, August 28, 2026 · 4:00 PM" (authored wall clock). */
export function formatEventDate(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso ?? '';
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()];
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(mo) - 1];
  let hour = Number(hh);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${weekday}, ${month} ${Number(d)}, ${Number(y)} &middot; ${hour}:${mm} ${period}`;
}

function paragraphs(list, color = TEXT) {
  return (list ?? [])
    .map(
      (p) =>
        `<p style="margin:0 0 1.1em;font-size:16px;line-height:1.7;color:${color};">${escapeHtml(p)}</p>`,
    )
    .join('\n');
}

/** Bulletproof table-based CTA button. */
function ctaButton(label, url) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto;">
  <tr><td style="border-radius:8px;background:${GOLD};">
    <a href="${escapeHtml(url)}" target="_blank"
       style="display:inline-block;padding:15px 36px;font-family:${SERIF};font-size:17px;font-weight:bold;color:#1a1408;text-decoration:none;border-radius:8px;letter-spacing:0.02em;">
      ${escapeHtml(label)}
    </a>
  </td></tr>
</table>`;
}

/**
 * @param spec  {subject, preheader, headline, intro: string[], outro?: string[],
 *               cta?: {label, url}, event?: {name, startTime, venueName,
 *               venueAddress, imageUrl?, priceLine?}}
 * @param unsubUrl  per-recipient unsubscribe URL (Mailgun `%recipient.unsub%`
 *                  during real sends; a concrete URL for previews/tests)
 */
export function renderCampaignHtml(spec, unsubUrl) {
  const ev = spec.event;
  const eventCard = ev
    ? `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin:8px 0 4px;background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
  ${ev.imageUrl ? `<tr><td><img src="${escapeHtml(ev.imageUrl)}" width="598" alt="${escapeHtml(ev.name)}" style="display:block;width:100%;height:auto;border-radius:11px 11px 0 0;border:0;" /></td></tr>` : ''}
  <tr><td style="padding:24px 28px 26px;">
    <p style="margin:0 0 6px;font-family:${SERIF};font-size:22px;line-height:1.3;color:#f5f0e6;font-weight:bold;">${escapeHtml(ev.name)}</p>
    <p style="margin:0 0 4px;font-size:16px;color:${GOLD};font-weight:bold;">${formatEventDate(ev.startTime)}</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(ev.venueName)}${ev.venueAddress ? ` &middot; ${escapeHtml(ev.venueAddress)}` : ''}</p>
    ${ev.priceLine ? `<p style="margin:8px 0 0;font-size:15px;color:${TEXT};">${escapeHtml(ev.priceLine)}</p>` : ''}
  </td></tr>
</table>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${escapeHtml(spec.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(spec.preheader ?? '')}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td align="center" style="padding:0 0 22px;">
    <a href="https://djkmdlegends.com" target="_blank" style="text-decoration:none;">
      <img src="https://djkmdlegends.com/assets/images/logo_legends_email.png" width="180" alt="DJKMD Legends"
           style="display:block;border:0;width:180px;height:auto;" />
    </a>
  </td></tr>
  <tr><td style="border-top:2px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Headline + intro -->
  <tr><td style="padding:26px 6px 4px;font-family:${SERIF};">
    <h1 style="margin:0 0 18px;font-size:30px;line-height:1.25;color:${GOLD};font-weight:bold;">${escapeHtml(spec.headline)}</h1>
    ${paragraphs(spec.intro)}
  </td></tr>

  <!-- Event card -->
  ${eventCard ? `<tr><td style="padding:6px 0;font-family:${SERIF};">${eventCard}</td></tr>` : ''}

  <!-- CTA -->
  ${spec.cta ? `<tr><td>${ctaButton(spec.cta.label, spec.cta.url)}</td></tr>` : ''}

  <!-- Outro -->
  ${spec.outro?.length ? `<tr><td style="padding:4px 6px 0;font-family:${SERIF};">${paragraphs(spec.outro, MUTED)}</td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:34px 6px 0;border-top:1px solid ${BORDER};font-family:${SERIF};" align="center">
    <p style="margin:18px 0 6px;font-size:12px;line-height:1.6;color:${FAINT};">
      You're receiving this because you bought tickets to one of our shows or joined the list at
      <a href="https://djkmdlegends.com" style="color:${FAINT};">djkmdlegends.com</a>.
    </p>
    <p style="margin:0 0 6px;font-size:12px;color:${FAINT};">${escapeHtml(POSTAL_ADDRESS)}</p>
    <p style="margin:0;font-size:12px;">
      <a href="${escapeHtml(unsubUrl)}" style="color:${FAINT};text-decoration:underline;">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Plain-text alternative part (deliverability + accessibility). */
export function renderCampaignText(spec, unsubUrl) {
  const ev = spec.event;
  const lines = [
    'DJKMD LEGENDS',
    '',
    spec.headline,
    '',
    ...(spec.intro ?? []),
  ];
  if (ev) {
    lines.push(
      '',
      ev.name,
      formatEventDate(ev.startTime).replace('&middot;', '-'),
      `${ev.venueName}${ev.venueAddress ? ` - ${ev.venueAddress}` : ''}`,
    );
    if (ev.priceLine) lines.push(ev.priceLine);
  }
  if (spec.cta) lines.push('', `${spec.cta.label}: ${spec.cta.url}`);
  if (spec.outro?.length) lines.push('', ...spec.outro);
  lines.push('', '---', POSTAL_ADDRESS, `Unsubscribe: ${unsubUrl}`);
  return lines.join('\n');
}
