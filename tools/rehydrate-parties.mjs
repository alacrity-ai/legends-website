#!/usr/bin/env node
// Re-hydrate nameless auto-roster party records (LGD-2).
//
// The Square webhook used to write `party:<eventId>:<paymentId>` records with
// empty firstName/lastName/email/phone. This script re-fetches the buyer
// identity from Square (order fulfillment note, payment, customer profile) —
// the same sources the fixed worker reads — and updates the records in the
// production GUESTLIST KV namespace.
//
// Usage:
//   SQUARE_ACCESS_TOKEN=… CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
//     node tools/rehydrate-parties.mjs [--dry-run]
//
// Only records missing a first name AND email are touched; CSV-backfilled or
// already-hydrated parties are left alone.

const GUESTLIST_NAMESPACE_ID = 'b52560156960470db4af905dc2e82f5d';
const SQUARE_BASE = 'https://connect.squareup.com';
const SQUARE_VERSION = '2025-01-23';
const CUSTOM_FIELD_TITLE = 'Full name (for the guest list)';

const dryRun = process.argv.includes('--dry-run');

const { SQUARE_ACCESS_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID } = process.env;
if (!SQUARE_ACCESS_TOKEN || !CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
  console.error('Set SQUARE_ACCESS_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID');
  process.exit(1);
}

const cfBase = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${GUESTLIST_NAMESPACE_ID}`;
const cfHeaders = { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` };
const sqHeaders = {
  Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
  'Square-Version': SQUARE_VERSION,
};

async function kvListKeys(prefix) {
  const keys = [];
  let cursor = '';
  do {
    const url = `${cfBase}/keys?prefix=${encodeURIComponent(prefix)}&limit=1000${cursor ? `&cursor=${cursor}` : ''}`;
    const res = await fetch(url, { headers: cfHeaders });
    const json = await res.json();
    if (!json.success) throw new Error(`KV list failed: ${JSON.stringify(json.errors)}`);
    keys.push(...json.result.map((k) => k.name));
    cursor = json.result_info?.cursor ?? '';
  } while (cursor);
  return keys;
}

async function kvGet(key) {
  const res = await fetch(`${cfBase}/values/${encodeURIComponent(key)}`, { headers: cfHeaders });
  if (!res.ok) return null;
  return res.text();
}

async function kvPut(key, value) {
  const res = await fetch(`${cfBase}/values/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { ...cfHeaders, 'Content-Type': 'text/plain' },
    body: value,
  });
  const json = await res.json();
  if (!json.success) throw new Error(`KV put failed for ${key}: ${JSON.stringify(json.errors)}`);
}

async function squareGet(path) {
  const res = await fetch(`${SQUARE_BASE}${path}`, { headers: sqHeaders });
  if (!res.ok) return null;
  return res.json();
}

function extractCustomFieldAnswer(note) {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith(`${CUSTOM_FIELD_TITLE.toLowerCase()}:`)) {
    return trimmed.slice(CUSTOM_FIELD_TITLE.length + 1).trim() || null;
  }
  const sep = trimmed.indexOf(': ');
  if (sep !== -1) return trimmed.slice(sep + 2).trim() || null;
  return trimmed;
}

function splitName(full) {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function addressName(addr) {
  if (!addr) return null;
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

async function resolveIdentity(paymentId) {
  const paymentJson = await squareGet(`/v2/payments/${paymentId}`);
  const payment = paymentJson?.payment;
  if (!payment) return null;

  let customFieldName = null;
  let recipient = null;
  if (payment.order_id) {
    const orderJson = await squareGet(`/v2/orders/${payment.order_id}`);
    const details = (orderJson?.order?.fulfillments ?? []).flatMap((f) =>
      [f.pickup_details, f.shipment_details, f.delivery_details].filter(Boolean),
    );
    customFieldName = extractCustomFieldAnswer(details.map((d) => d.note).find((n) => n && n.trim()) ?? null);
    recipient = details.map((d) => d.recipient).find(Boolean) ?? null;
  }

  let customer = null;
  if (payment.customer_id) {
    const customerJson = await squareGet(`/v2/customers/${payment.customer_id}`);
    customer = customerJson?.customer ?? null;
  }
  const customerName =
    [customer?.given_name, customer?.family_name].filter(Boolean).join(' ').trim() || null;

  const name =
    customFieldName ??
    customerName ??
    addressName(payment.billing_address) ??
    addressName(payment.shipping_address) ??
    recipient?.display_name ??
    null;

  return {
    ...splitName(name),
    email: payment.buyer_email_address ?? customer?.email_address ?? recipient?.email_address ?? '',
    phone: customer?.phone_number ?? recipient?.phone_number ?? null,
  };
}

const keys = await kvListKeys('party:');
console.log(`${keys.length} party records found${dryRun ? ' (dry run)' : ''}`);

let updated = 0;
let skippedNamed = 0;
let failed = 0;
for (const key of keys) {
  const raw = await kvGet(key);
  if (!raw) continue;
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    console.warn(`SKIP malformed: ${key}`);
    continue;
  }
  if ((record.firstName && record.firstName.trim()) || (record.email && record.email.trim())) {
    skippedNamed++;
    continue;
  }

  const identity = await resolveIdentity(record.paymentId);
  if (!identity || (!identity.firstName && !identity.email)) {
    console.warn(`FAIL no identity resolvable: ${key}`);
    failed++;
    continue;
  }

  const next = { ...record, ...identity };
  console.log(
    `${dryRun ? 'WOULD UPDATE' : 'UPDATE'} ${key} → ${identity.firstName} ${identity.lastName} <${identity.email}> ${identity.phone ?? ''}`,
  );
  if (!dryRun) await kvPut(key, JSON.stringify(next));
  updated++;
}

console.log(`done: ${updated} updated, ${skippedNamed} already had identity, ${failed} unresolvable`);
