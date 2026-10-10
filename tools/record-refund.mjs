#!/usr/bin/env node
// Take refunded tickets off a show: the buyer got their money back (Keith refunded in Square, or paid
// them back by Venmo/cash), so they leave the door list, `sold` and Sales, and their seats go back on
// sale (docs/sops/refund-or-remove-tickets.md, LGD-37).
//
// Usage:
//   LEGENDS_ADMIN_PASSCODE=… node tools/record-refund.mjs \
//     --show <eventId|name fragment> (--party <paymentId> | --find "stairs") \
//     --method square|venmo|cash|check|other [--qty 1] [--amount 42.50] [--note "…"] [--apply]
//
//   --find    list the show's parties whose name/email contains the term (pick one, rerun with --party)
//   --qty     tickets coming off; omit to refund the whole party
//   --amount  dollars that went back; omit and the party's share of what it paid is used
//   --apply   actually write — without it the tool only shows what it would do
//
// The API owns the rules (sold counter, seats, check-in, the marker that stops Square re-adding the
// buyer); this script only looks things up, prints the plan, and calls it.

const BASE = process.env.LEGENDS_ADMIN_BASE ?? 'https://admin.djkmdlegends.com';
const PASS = process.env.LEGENDS_ADMIN_PASSCODE;
if (!PASS) {
  console.error('Set LEGENDS_ADMIN_PASSCODE');
  process.exit(1);
}

const args = process.argv.slice(2);
const one = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const apply = args.includes('--apply');
const showArg = one('--show');
if (!showArg) {
  console.error('--show is required (event id or a fragment of the show name)');
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${PASS}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${body.error ?? ''}`);
  return body;
}

const when = (iso) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
const describe = (p) =>
  `${p.firstName} ${p.lastName ?? ''}`.trim() +
  ` <${p.email || 'no email'}> · ${p.quantity} ticket(s)` +
  (p.seatLabels?.length ? ` · seats ${p.seatLabels.join(', ')}` : '') +
  (p.notes ? ` · ${p.notes}` : '') +
  ` · ${p.id}`;

/* ── Find the show ─────────────────────────────────────────── */
const { events } = await api('/api/admin/events');
let show = events.find((e) => e.id === showArg);
if (!show) {
  const frag = showArg.toLowerCase();
  const hits = events.filter((e) => e.showName.toLowerCase().includes(frag) && new Date(e.startTime) > new Date());
  if (hits.length !== 1) {
    console.error(hits.length ? `"${showArg}" matches ${hits.length} upcoming shows:` : `No upcoming show matches "${showArg}". Upcoming:`);
    for (const e of hits.length ? hits : events.filter((e) => new Date(e.startTime) > new Date())) {
      console.error(`  ${e.id}  ${e.showName} — ${when(e.startTime)}`);
    }
    process.exit(1);
  }
  show = hits[0];
}
const { parties } = await api(`/api/admin/events/${show.id}/guests`);
console.log(`${show.showName} — ${when(show.startTime)} (${show.id}); sold ${show.sold}`);

const find = one('--find');
if (find) {
  const term = find.toLowerCase();
  const hits = parties.filter((p) => `${p.firstName} ${p.lastName ?? ''} ${p.email ?? ''}`.toLowerCase().includes(term));
  console.log(hits.length ? hits.map((p) => '  ' + describe(p)).join('\n') : `  nobody on this show matches "${find}"`);
  process.exit(0);
}

/* ── The refund ────────────────────────────────────────────── */
const partyId = one('--party');
const method = one('--method');
if (!partyId || !method) {
  console.error('--party and --method are required (or use --find to look someone up)');
  process.exit(1);
}
const party = parties.find((p) => p.id === partyId);
if (!party) {
  console.error(`Party ${partyId} is not on this show's list (already refunded or moved?)`);
  process.exit(1);
}
const body = { method };
if (one('--qty')) body.quantity = Number(one('--qty'));
if (one('--amount')) body.amountCents = Math.round(Number(one('--amount')) * 100);
if (one('--note')) body.note = one('--note');
const qty = body.quantity ?? party.quantity;

console.log(`  party:   ${describe(party)}`);
console.log(`  refund:  ${qty} of ${party.quantity} ticket(s) by ${method}` +
  (body.amountCents !== undefined ? `, $${(body.amountCents / 100).toFixed(2)} back` : ', amount = their share of what they paid') +
  (body.note ? ` — "${body.note}"` : ''));
console.log(`  after:   ${party.quantity - qty ? `${party.quantity - qty} ticket(s) stay on the list` : 'off the door list'}; sold ${show.sold} → ${show.sold - qty}`);
if (!apply) {
  console.log('\nDry run. Nothing written. Add --apply to record it.');
  process.exit(0);
}
const r = await api(`/api/admin/events/${show.id}/parties/${party.id}/refund`, { method: 'POST', body: JSON.stringify(body) });
console.log(`\nRecorded: ${r.refunded} ticket(s) off; ${r.remaining} left on the party; show sold now ${r.sold}.`);
