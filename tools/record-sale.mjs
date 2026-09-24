#!/usr/bin/env node
// Record a sale made outside Square — cash to Keith, a check, a comp — so the
// buyer is on the door list, holds their seats on the chart and counts in
// Sales (docs/sops/record-cash-sale.md). Or void one recorded by mistake.
//
// Usage:
//   LEGENDS_ADMIN_PASSCODE=… node tools/record-sale.mjs \
//     --show <eventId|name fragment> --name "Carol Davis" --qty 2 \
//     [--type "Show Ticket - With Dinner"] [--method cash|check|comp|other] [--amount 129.00] \
//     [--email x@y.com] [--phone +1978…] [--taken-by Keith] [--note "…"] \
//     [--table T4 | --seats T4-1,T4-2] [--send-confirmation] [--apply]
//
//   LEGENDS_ADMIN_PASSCODE=… node tools/record-sale.mjs --show <…> --void door-xxxxxxxxxxxx [--apply]
//
//   --type    defaults to the show's only ticket type; required when it sells several
//   --table   picks the first free seats on that table (by label, e.g. T4); --seats names them
//   --amount  dollars actually taken; omit and Sales estimates from the ticket price ("est.")
//   --apply   actually write — without it the tool only shows what it would do
//
// The API owns the rules (ticket types, seat clashes, sold counters, cancelled shows);
// this script only looks things up, prints the plan, and calls it.

const BASE = process.env.LEGENDS_ADMIN_BASE ?? 'https://admin.djkmdlegends.com';
const PASS = process.env.LEGENDS_ADMIN_PASSCODE;
if (!PASS) {
  console.error('Set LEGENDS_ADMIN_PASSCODE');
  process.exit(1);
}

const args = process.argv.slice(2);
const one = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const has = (flag) => args.includes(flag);
const apply = has('--apply');
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
const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;

/* ── Find the show ─────────────────────────────────────────── */
const { events } = await api('/api/admin/events');
let show = events.find((e) => e.id === showArg);
if (!show) {
  const frag = showArg.toLowerCase();
  const hits = events.filter((e) => e.showName.toLowerCase().includes(frag) && new Date(e.startTime) > new Date());
  if (hits.length !== 1) {
    console.error(hits.length ? `"${showArg}" matches ${hits.length} upcoming shows:` : `No upcoming show matches "${showArg}". Upcoming:`);
    for (const e of hits.length ? hits : events.filter((e) => new Date(e.startTime) > new Date())) console.error(`  ${e.id}  ${when(e.startTime)}  ${e.showName}`);
    process.exit(1);
  }
  show = hits[0];
}
const detail = (await api(`/api/admin/events/${show.id}`)).event;
const roster = await api(`/api/admin/events/${show.id}/guests`);
console.log(`SHOW: ${detail.showName} — ${when(detail.startTime)} — ${detail.venueName}`);
console.log(`      sold ${detail.sold}${detail.capacity != null ? ` / ${detail.capacity}` : ''}, ${roster.parties.length} parties on the list, ${roster.seating ? 'reserved seating' : 'general admission'}${detail.cancelledAt ? ', CANCELLED' : ''}`);
console.log(`      tickets: ${detail.tickets.map((t) => `${t.ticketType} ${dollars(t.priceCents)}`).join(' · ')}`);

/* ── Void ──────────────────────────────────────────────────── */
const voidId = one('--void');
if (voidId) {
  const p = roster.parties.find((x) => x.id === voidId);
  if (!p) {
    console.error(`No party ${voidId} on this show. Recorded (door-…) parties here:`);
    for (const x of roster.parties.filter((x) => x.id.startsWith('door-'))) console.error(`  ${x.id}  ${x.quantity}  ${x.firstName} ${x.lastName}  ${x.notes ?? ''}`);
    process.exit(1);
  }
  console.log(`\nWOULD VOID: ${p.id}  ${p.quantity} × ${p.firstName} ${p.lastName}  ${p.seatLabels?.length ? p.seatLabels.join(', ') : ''}  (${p.notes ?? ''})`);
  console.log(`Expected after: sold ${detail.sold - p.quantity}`);
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to void it.');
    process.exit(0);
  }
  const r = await api(`/api/admin/events/${show.id}/parties/${p.id}`, { method: 'DELETE' });
  console.log(`\nVOIDED. sold is now ${r.sold}.`);
  process.exit(0);
}

/* ── Record ────────────────────────────────────────────────── */
const name = one('--name');
const qty = Number(one('--qty'));
if (!name || !Number.isInteger(qty) || qty < 1) {
  console.error('--name "First Last" and --qty N are required');
  process.exit(1);
}
const [firstName, ...rest] = name.trim().split(/\s+/);
const lastName = rest.join(' ');

let ticketType = one('--type');
if (!ticketType) {
  if (detail.tickets.length !== 1) {
    console.error(`This show sells ${detail.tickets.length} ticket types; pass --type: ${detail.tickets.map((t) => `"${t.ticketType}"`).join(' | ')}`);
    process.exit(1);
  }
  ticketType = detail.tickets[0].ticketType;
}
const method = one('--method') ?? 'cash';
const amountArg = one('--amount');
const amountCents = amountArg === undefined ? undefined : Math.round(Number(amountArg) * 100);
if (amountArg !== undefined && (!Number.isFinite(amountCents) || amountCents < 0)) {
  console.error('--amount must be dollars, e.g. 129.00');
  process.exit(1);
}

// Seats: --seats T4-1,T4-2 (labels) or --table T4 (first free seats there).
let seatIds = [];
const wantTable = one('--table');
const wantSeats = one('--seats');
if (wantTable || wantSeats) {
  if (!roster.seating) {
    console.error('This show has no seating chart; drop --table / --seats');
    process.exit(1);
  }
  const { layout, seats } = roster.seating;
  const byLabel = new Map();
  for (const o of layout.objects) {
    if (o.kind === 'stage') continue;
    for (let n = 1; n <= o.seats; n++) {
      const id = `${o.id}.${n}`;
      byLabel.set(`${o.label}-${n}`.toUpperCase(), { id, table: String(o.label).toUpperCase(), status: seats[id]?.status ?? 'available' });
    }
  }
  if (wantSeats) {
    for (const label of wantSeats.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) {
      const seat = byLabel.get(label);
      if (!seat) {
        console.error(`No seat labelled ${label} on this chart`);
        process.exit(1);
      }
      seatIds.push(seat.id);
    }
  } else {
    const free = [...byLabel.entries()].filter(([, s]) => s.table === wantTable.toUpperCase() && s.status === 'available');
    const all = [...byLabel.values()].filter((s) => s.table === wantTable.toUpperCase());
    if (!all.length) {
      console.error(`No table ${wantTable} on this chart. Tables: ${[...new Set([...byLabel.values()].map((s) => s.table))].join(', ')}`);
      process.exit(1);
    }
    if (free.length < qty) {
      console.error(`Table ${wantTable} has ${free.length} free of ${all.length}; need ${qty}. Pick another table or use --seats.`);
      process.exit(1);
    }
    seatIds = free.slice(0, qty).map(([, s]) => s.id);
  }
}
const labelOf = (id) => {
  if (!roster.seating) return id;
  const o = roster.seating.layout.objects.find((x) => id.startsWith(`${x.id}.`));
  return o ? `${o.label}-${id.split('.').pop()}` : id;
};

const body = {
  firstName,
  lastName,
  email: one('--email') ?? '',
  phone: one('--phone') ?? '',
  quantity: qty,
  ticketType,
  method,
  ...(amountCents !== undefined ? { amountCents } : {}),
  ...(one('--taken-by') ? { takenBy: one('--taken-by') } : {}),
  ...(one('--note') ? { note: one('--note') } : {}),
  ...(seatIds.length ? { seatIds } : {}),
  ...(has('--send-confirmation') ? { sendConfirmation: true } : {}),
};

const dupes = roster.parties.filter((p) => `${p.firstName} ${p.lastName}`.trim().toLowerCase() === name.trim().toLowerCase() || (body.email && p.email.toLowerCase() === body.email.toLowerCase()));
if (dupes.length) {
  console.log(`\nNOTE: already on this show's list —`);
  for (const p of dupes) console.log(`  ${p.id}  ${p.quantity}  ${p.firstName} ${p.lastName} <${p.email}>  ${p.notes ?? ''}`);
}

const unit = detail.tickets.find((t) => t.ticketType === ticketType)?.priceCents;
console.log(`\nWOULD RECORD: ${qty} × ${ticketType} for ${firstName} ${lastName}${body.email ? ` <${body.email}>` : ''}${body.phone ? ` ${body.phone}` : ''}`);
console.log(`  paid: ${method}${body.takenBy ? ` (${body.takenBy})` : ''} — ${amountCents !== undefined ? dollars(amountCents) : `no amount given; Sales will estimate ${unit !== undefined ? dollars(unit * qty) : '—'}`}`);
if (roster.seating) console.log(`  seats: ${seatIds.length ? seatIds.map(labelOf).join(', ') : 'none (unassigned — staff seat them from Check-in)'}`);
if (body.note) console.log(`  note: ${body.note}`);
console.log(`  confirmation email: ${body.sendConfirmation ? `yes → ${body.email}` : 'no'}`);
console.log(`Expected after: sold ${detail.sold + qty}${detail.capacity != null ? ` / ${detail.capacity}` : ''}`);

if (!apply) {
  console.log('\nDry run. Re-run with --apply to record it.');
  process.exit(0);
}

const r = await api(`/api/admin/events/${show.id}/parties`, { method: 'POST', body: JSON.stringify(body) });
console.log(`\nRECORDED ${r.party.id}: ${r.party.firstName} ${r.party.lastName}, ${r.party.quantity} tickets${r.party.seatLabels?.length ? `, seats ${r.party.seatLabels.join(', ')}` : ''}; note "${r.party.notes}". sold is now ${r.sold}${r.soldOut ? ' (SOLD OUT)' : ''}.`);
if (r.confirmation) console.log(r.confirmation.sentTo ? `Confirmation sent to ${r.confirmation.sentTo}.` : `Confirmation NOT sent: ${r.confirmation.error}`);
console.log(`Undo: node tools/record-sale.mjs --show ${show.id} --void ${r.party.id} --apply`);
