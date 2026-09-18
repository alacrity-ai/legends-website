#!/usr/bin/env node
// Move parties from one show to another through the admin API
// (docs/sops/transfer-tickets-between-shows.md).
//
// Usage:
//   LEGENDS_ADMIN_PASSCODE=… node tools/transfer-tickets.mjs \
//     --from <eventId> --to <eventId> [--find "davis,johola,…"] [--move <paymentId>[:qty] …] [--apply]
//
//   --find   list the source-show parties whose name/email contains any term
//   --move   a party to move; `:qty` moves only part of it (default: all)
//   --apply  actually transfer — without it nothing is written (dry run)
//
// The API owns the rules (sold counters, the marker left on the source show,
// seated-show refusal); this script only finds people and calls it.

const BASE = process.env.LEGENDS_ADMIN_BASE ?? 'https://admin.djkmdlegends.com';
const PASS = process.env.LEGENDS_ADMIN_PASSCODE;
if (!PASS) {
  console.error('Set LEGENDS_ADMIN_PASSCODE');
  process.exit(1);
}

const args = process.argv.slice(2);
const one = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const many = (flag) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));
const from = one('--from');
const to = one('--to');
const find = (one('--find') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
const moves = many('--move').map((m) => {
  const [paymentId, qty] = m.split(':');
  return { paymentId, quantity: qty ? Number(qty) : undefined };
});
const apply = args.includes('--apply');
if (!from || !to) {
  console.error('--from and --to are required');
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

const show = async (id) => (await api(`/api/admin/events/${id}`)).event;
const guests = async (id) => (await api(`/api/admin/events/${id}/guests`)).parties;
const line = (p) => `${p.id}  ${String(p.quantity).padStart(2)}  ${p.firstName} ${p.lastName} <${p.email}>`;
const head = (label, e, parties) =>
  console.log(`${label}: ${e.showName} — ${e.startTime} — sold ${e.sold}, ${parties.length} parties / ${parties.reduce((n, p) => n + p.quantity, 0)} tickets on the list`);

const [src, dst, srcGuests, dstGuests] = await Promise.all([show(from), show(to), guests(from), guests(to)]);
head('FROM', src, srcGuests);
head('TO  ', dst, dstGuests);

if (find.length) {
  console.log('\nMatches on the source show:');
  for (const p of srcGuests) {
    const hay = `${p.firstName} ${p.lastName} ${p.email}`.toLowerCase();
    if (find.some((t) => hay.includes(t))) console.log('  ' + line(p));
  }
}

if (!moves.length) process.exit(0);

console.log(`\n${apply ? 'Transferring' : 'Would transfer (dry run — add --apply)'}:`);
let total = 0;
for (const m of moves) {
  const p = srcGuests.find((g) => g.id === m.paymentId);
  if (!p) throw new Error(`${m.paymentId} is not on the source show — nothing further was moved`);
  const qty = m.quantity ?? p.quantity;
  total += qty;
  if (!apply) {
    console.log(`  ${qty} of ${line(p)}`);
    continue;
  }
  const r = await api(`/api/admin/events/${from}/parties/${m.paymentId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ toEventId: to, ...(m.quantity ? { quantity: m.quantity } : {}) }),
  });
  console.log(`  moved ${r.moved} of ${line(p)} → source sold ${r.sourceSold}, target sold ${r.targetSold}`);
}
console.log(`\n${total} tickets. Expected after: FROM sold ${src.sold - total}, TO sold ${dst.sold + total}.`);

if (apply) {
  const [a, b, ag, bg] = await Promise.all([show(from), show(to), guests(from), guests(to)]);
  console.log('');
  head('FROM', a, ag);
  head('TO  ', b, bg);
}
