/**
 * Send a branded campaign email to the DJKMD Legends mailing list via Mailgun.
 * Human-triggered only — see docs/sops/send-mailing-list-campaign.md for the
 * full workflow (spec format, design rules, compliance checklist, test-first).
 *
 * Modes (exactly one):
 *   --preview            render HTML+text to ./campaign-preview.html / .txt, send nothing
 *   --to <email>         send the campaign to ONE address (testing)
 *   --all                send to every subscriber who has not unsubscribed
 *
 * Options:
 *   --spec <path>        campaign spec JSON (required)
 *   --source a,b         with --all: restrict to sources (signup,purchase,import)
 *
 * Env: MAILGUN_API_KEY, UNSUBSCRIBE_SECRET always; CLOUDFLARE_API_TOKEN +
 * CLOUDFLARE_ACCOUNT_ID when --all or when the spec has an eventId.
 * Never prints subscriber emails; counts only.
 */
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { renderCampaignHtml, renderCampaignText } from './campaign-template.mjs';

const MAILGUN_DOMAIN = 'mg.djkmdlegends.com';
const SITE = 'https://djkmdlegends.com';
const MAILING_LIST_NS = '87b3a569d4e145a4a7458c26d88ad8fa';
const EVENTS_NS = 'b756d4fef5c44daca7c6320c8171faf1';
const FROM = `DJKMD Legends <events@${MAILGUN_DOMAIN}>`;
const REPLY_TO = 'booking@djkmdlegends.com';
const BATCH = 900; // Mailgun caps batched recipients at 1000/message

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}
const has = (flag) => process.argv.includes(flag);

const specPath = arg('--spec');
const toOne = arg('--to');
const preview = has('--preview');
const all = has('--all');
if (!specPath || [preview, Boolean(toOne), all].filter(Boolean).length !== 1) {
  console.error('usage: send-campaign.mjs --spec <path> (--preview | --to <email> | --all) [--source signup,purchase]');
  process.exit(1);
}

const { MAILGUN_API_KEY, UNSUBSCRIBE_SECRET, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID } =
  process.env;
if (!UNSUBSCRIBE_SECRET || (!preview && !MAILGUN_API_KEY)) {
  console.error('UNSUBSCRIBE_SECRET (and MAILGUN_API_KEY unless --preview) are required');
  process.exit(1);
}

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
for (const field of ['subject', 'headline', 'intro']) {
  if (!spec[field]) {
    console.error(`spec is missing "${field}"`);
    process.exit(1);
  }
}

const kvBase = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces`;
const kvHeaders = { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` };

async function kvGet(ns, key) {
  const res = await fetch(`${kvBase}/${ns}/values/${encodeURIComponent(key)}`, { headers: kvHeaders });
  return res.ok ? res.json().catch(() => null) : null;
}

// Resolve eventId in the spec to a rendered event card + default CTA.
if (spec.eventId) {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
    console.error('CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID required to resolve eventId');
    process.exit(1);
  }
  const record = await kvGet(EVENTS_NS, `event:${spec.eventId}`);
  if (!record) {
    console.error(`event ${spec.eventId} not found in EVENTS KV`);
    process.exit(1);
  }
  const prices = (record.tickets ?? [])
    .map((t) => `${t.ticketType} — $${(t.priceCents / 100).toFixed(2).replace(/\.00$/, '')}`)
    .join(' · ');
  spec.event = {
    name: record.showName,
    startTime: record.startTime,
    venueName: record.venueName,
    venueAddress: record.venueAddress,
    imageUrl: `${SITE}/api/events/${spec.eventId}/image`,
    priceLine: prices || undefined,
  };
  spec.cta ??= { label: 'Get Tickets', url: `${SITE}/?event=${spec.eventId}` };
}

const unsubToken = (email) =>
  createHmac('sha256', UNSUBSCRIBE_SECRET).update(email.trim().toLowerCase()).digest('hex');
const unsubUrl = (email) =>
  `${SITE}/api/mailing-list/unsubscribe?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubToken(email)}`;

if (preview) {
  const sample = unsubUrl('preview@example.com');
  writeFileSync('campaign-preview.html', renderCampaignHtml(spec, sample));
  writeFileSync('campaign-preview.txt', renderCampaignText(spec, sample));
  console.log('wrote campaign-preview.html and campaign-preview.txt — nothing sent');
  process.exit(0);
}

async function sendBatch(recipients) {
  // One API call, Mailgun expands %recipient.*% per address.
  const vars = Object.fromEntries(recipients.map((r) => [r.email, { unsub: unsubUrl(r.email) }]));
  const form = new FormData();
  form.append('from', spec.from ?? FROM);
  for (const r of recipients) form.append('to', r.name ? `${r.name} <${r.email}>` : r.email);
  form.append('subject', spec.subject);
  form.append('html', renderCampaignHtml(spec, '%recipient.unsub%'));
  form.append('text', renderCampaignText(spec, '%recipient.unsub%'));
  form.append('recipient-variables', JSON.stringify(vars));
  form.append('h:Reply-To', spec.replyTo ?? REPLY_TO);
  form.append('h:List-Unsubscribe', '<%recipient.unsub%>');
  form.append('h:List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
  form.append('o:tag', spec.tag ?? 'campaign');

  const res = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64')}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mailgun ${res.status}: ${JSON.stringify(body)}`);
  return body.id;
}

let recipients;
if (toOne) {
  recipients = [{ email: toOne, name: null }];
} else {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
    console.error('CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID required for --all');
    process.exit(1);
  }
  const sources = arg('--source')?.split(',').map((s) => s.trim());
  const keys = [];
  let cursor = null;
  do {
    const u = new URL(`${kvBase}/${MAILING_LIST_NS}/keys`);
    u.searchParams.set('limit', '1000');
    if (cursor) u.searchParams.set('cursor', cursor);
    const body = await (await fetch(u, { headers: kvHeaders })).json();
    if (!body.success) throw new Error(`KV list failed: ${JSON.stringify(body.errors)}`);
    keys.push(...body.result.map((k) => k.name));
    cursor = body.result_info?.cursor || null;
  } while (cursor);

  const entries = await Promise.all(keys.map((k) => kvGet(MAILING_LIST_NS, k)));
  let unsubscribed = 0;
  let filteredOut = 0;
  recipients = keys.flatMap((email, i) => {
    const e = entries[i];
    if (!e) return [];
    if (e.unsubscribedAt) {
      unsubscribed += 1;
      return [];
    }
    if (sources && !sources.includes(e.source ?? 'signup')) {
      filteredOut += 1;
      return [];
    }
    return [{ email, name: e.name ?? null }];
  });
  console.log(
    `list: ${keys.length} total, ${unsubscribed} unsubscribed, ${filteredOut} outside --source filter, ${recipients.length} to send`,
  );
}

if (recipients.length === 0) {
  console.log('nothing to send');
  process.exit(0);
}

const ids = [];
for (let i = 0; i < recipients.length; i += BATCH) {
  ids.push(await sendBatch(recipients.slice(i, i + BATCH)));
}
console.log(`sent to ${recipients.length} recipient(s) in ${ids.length} batch(es):`, ids.join(' '));
