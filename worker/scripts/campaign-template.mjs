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

// CAN-SPAM requires a valid physical postal address in every marketing email.
// DJKMD's business address (Leif, 2026-10-06).
export const POSTAL_ADDRESS = 'DJKMD Presents Legends · 306 Boston Road, Unit K, Billerica, MA 01862';

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

/** Full-bleed campaign art above the headline (hero layout). */
function heroImage(url, alt, href) {
  const img = `<img src="${escapeHtml(url)}" width="600" alt="${escapeHtml(alt ?? '')}"
       style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:12px;" />`;
  return `
<tr><td align="center" style="padding:0 0 6px;">
  ${href ? `<a href="${escapeHtml(href)}" target="_blank" style="text-decoration:none;">${img}</a>` : img}
</td></tr>`;
}

/** Gold-labelled rows — When / Where / Tickets / On stage / Opening. */
function factsBlock(facts) {
  const rows = facts
    .map(
      (f) =>
        `<span style="color:${GOLD};">${escapeHtml(f.label)}</span>&nbsp; ${escapeHtml(f.value)}`,
    )
    .join('<br />\n        ');
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin:8px 0 4px;background:${CARD};border:1px solid ${BORDER};border-radius:12px;">
  <tr><td style="padding:22px 26px;font-size:15px;line-height:1.85;color:${TEXT};">
        ${rows}
  </td></tr>
</table>`;
}

/** Spaced small-caps line above the headline ("Back by popular demand"). */
function kickerLine(text, accent) {
  return `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;letter-spacing:0.22em;text-transform:uppercase;color:${accent};font-weight:bold;">${escapeHtml(text)}</p>`;
}

/** Who's on stage: a label over the names, separated by accent stars. */
function lineupBlock(lineup, accent) {
  const names = lineup.names
    .map((n) => `<span style="white-space:nowrap;">${escapeHtml(n)}</span>`)
    .join(`&nbsp;<span style="color:${accent};">&#9733;</span> `);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin:6px 0 4px;border-top:1px solid ${BORDER};border-bottom:1px solid ${BORDER};">
  <tr><td align="center" style="padding:20px 10px 22px;">
    ${lineup.label ? `<p style="margin:0 0 10px;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${MUTED};">${escapeHtml(lineup.label)}</p>` : ''}
    <p style="margin:0;font-size:19px;line-height:1.75;color:#f5f0e6;">${names}</p>
  </td></tr>
</table>`;
}

/** Side-by-side ticket cards: name, big price, optional note. */
function ticketOptionsBlock(options, accent) {
  const width = Math.floor(100 / options.length);
  const cells = options
    .map(
      (o, i) => `
    <td width="${width}%" valign="top" style="padding:0 ${i < options.length - 1 ? '6px' : '0'} 0 ${i > 0 ? '6px' : '0'};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             style="background:${CARD};border:1px solid ${BORDER};border-top:3px solid ${accent};border-radius:10px;">
        <tr><td align="center" style="padding:18px 12px 20px;">
          <p style="margin:0 0 6px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:${MUTED};">${escapeHtml(o.name)}</p>
          <p style="margin:0;font-size:30px;line-height:1.2;color:${GOLD};font-weight:bold;">${escapeHtml(o.price)}</p>
          ${o.note ? `<p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(o.note)}</p>` : ''}
        </td></tr>
      </table>
    </td>`,
    )
    .join('');
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 0;">
  <tr>${cells}
  </tr>
</table>`;
}

/**
 * @param spec  {subject, preheader, headline, intro: string[], outro?: string[],
 *               cta?: {label, url}, event?: {name, startTime, venueName,
 *               venueAddress, imageUrl?, priceLine?},
 *               hero?: {url, alt}, facts?: {label, value}[], ctaNote?: string,
 *               kicker?: string, accent?: '#rrggbb',
 *               lineup?: {label?, names: string[]},
 *               ticketOptions?: {name, price, note?}[]}
 *
 * `hero` opts into the hero layout: art on top, a centered lead paragraph and a
 * facts block in place of the event card. Without it the classic layout renders
 * exactly as before.
 *
 * `kicker`, `lineup`, `ticketOptions` and `accent` are opt-in extras for a
 * marquee show: a spaced line over the headline, the names on stage, price
 * cards above the CTA, and a per-campaign accent colour (kicker, stars, card
 * tops) that echoes the show's art. Gold stays the brand colour for the
 * headline, prices and button.
 * @param unsubUrl  per-recipient unsubscribe URL (Mailgun `%recipient.unsub%`
 *                  during real sends; a concrete URL for previews/tests)
 */
export function renderCampaignHtml(spec, unsubUrl) {
  const ev = spec.event;
  const facts = spec.facts?.length ? spec.facts : null;
  const accent = /^#[0-9a-f]{6}$/i.test(spec.accent ?? '') ? spec.accent : GOLD;
  // Hero layout: the first paragraph is the centered lead, the rest sit under the CTA.
  const lead = (spec.intro ?? []).slice(0, 1);
  const body = (spec.intro ?? []).slice(1);
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

  ${spec.hero ? heroImage(spec.hero.url, spec.hero.alt ?? spec.headline, spec.cta?.url) : ''}

  <!-- Headline + lead -->
  <tr><td style="padding:26px 6px 4px;font-family:${SERIF};"${spec.hero ? ' align="center"' : ''}>
    ${spec.kicker ? kickerLine(spec.kicker, accent) : ''}
    <h1 style="margin:0 0 18px;font-size:30px;line-height:1.25;color:${GOLD};font-weight:bold;">${escapeHtml(spec.headline)}</h1>
    ${spec.hero ? paragraphs(lead, MUTED) : paragraphs(spec.intro)}
  </td></tr>

  <!-- Lineup -->
  ${spec.lineup?.names?.length ? `<tr><td style="padding:4px 0;font-family:${SERIF};">${lineupBlock(spec.lineup, accent)}</td></tr>` : ''}

  <!-- Facts block (hero layout) or the classic event card -->
  ${facts ? `<tr><td style="padding:6px 0;font-family:${SERIF};">${factsBlock(facts)}</td></tr>` : ''}
  ${!facts && eventCard ? `<tr><td style="padding:6px 0;font-family:${SERIF};">${eventCard}</td></tr>` : ''}

  <!-- Ticket options -->
  ${spec.ticketOptions?.length ? `<tr><td style="padding:0;font-family:${SERIF};">${ticketOptionsBlock(spec.ticketOptions, accent)}</td></tr>` : ''}

  <!-- CTA -->
  ${spec.cta ? `<tr><td>${ctaButton(spec.cta.label, spec.cta.url)}</td></tr>` : ''}
  ${spec.ctaNote ? `<tr><td align="center" style="padding:0 6px 6px;font-family:${SERIF};"><p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(spec.ctaNote)}</p></td></tr>` : ''}

  <!-- Body copy (hero layout keeps the rest of the intro here, under the CTA) -->
  ${spec.hero && body.length ? `<tr><td style="padding:14px 6px 0;font-family:${SERIF};">${paragraphs(body)}</td></tr>` : ''}

  <!-- Outro -->
  ${spec.outro?.length ? `<tr><td style="padding:4px 6px 0;font-family:${SERIF};">${paragraphs(spec.outro, MUTED)}</td></tr>` : ''}

  ${spec.hero && spec.cta ? `<tr><td align="center" style="padding:18px 6px 28px;font-family:${SERIF};"><a href="${escapeHtml(spec.cta.url)}" target="_blank" style="font-size:14px;color:${GOLD};text-decoration:underline;">${escapeHtml(spec.cta.label)} &rsaquo;</a></td></tr>` : ''}

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
    ...(spec.kicker ? [spec.kicker.toUpperCase()] : []),
    spec.headline,
    '',
    ...(spec.intro ?? []),
  ];
  if (spec.lineup?.names?.length) {
    lines.push('', `${spec.lineup.label ? `${spec.lineup.label}: ` : ''}${spec.lineup.names.join(' * ')}`);
  }
  if (spec.facts?.length) {
    lines.push('', ...spec.facts.map((f) => `${f.label}: ${f.value}`));
  } else if (ev) {
    lines.push(
      '',
      ev.name,
      formatEventDate(ev.startTime).replace('&middot;', '-'),
      `${ev.venueName}${ev.venueAddress ? ` - ${ev.venueAddress}` : ''}`,
    );
    if (ev.priceLine) lines.push(ev.priceLine);
  }
  if (spec.ticketOptions?.length) {
    lines.push('', ...spec.ticketOptions.map((o) => `${o.name}: ${o.price}${o.note ? ` (${o.note})` : ''}`));
  }
  if (spec.cta) lines.push('', `${spec.cta.label}: ${spec.cta.url}`);
  if (spec.ctaNote) lines.push(spec.ctaNote);
  if (spec.outro?.length) lines.push('', ...spec.outro);
  lines.push('', '---', POSTAL_ADDRESS, `Unsubscribe: ${unsubUrl}`);
  return lines.join('\n');
}
