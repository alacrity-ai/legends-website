/**
 * One-off (but idempotent, safe to re-run) backfill of the MAILING_LIST KV
 * from everyone we already know: existing form signups, Square sale party
 * records, and the legacy CSV roster. Dedupes by lowercased email using the
 * same merge rules the worker applies on live sales.
 *
 * Dry run (default) prints counts only; nothing is written and no emails are
 * printed. Run with --apply to write.
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     node --experimental-strip-types scripts/backfill-mailing-list.mjs [--apply]
 */
import {
  mergeMailingListEntry,
  normalizeExisting,
} from '../src/services/mailing-list.ts';

const MAILING_LIST_NS = '87b3a569d4e145a4a7458c26d88ad8fa';
const GUESTLIST_NS = 'b52560156960470db4af905dc2e82f5d';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
  process.exit(1);
}
const apply = process.argv.includes('--apply');

const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces`;
const headers = { Authorization: `Bearer ${token}` };

async function listKeys(ns) {
  const keys = [];
  let cursor = null;
  do {
    const url = new URL(`${base}/${ns}/keys`);
    url.searchParams.set('limit', '1000');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers });
    const body = await res.json();
    if (!body.success) throw new Error(`list keys failed: ${JSON.stringify(body.errors)}`);
    keys.push(...body.result.map((k) => k.name));
    cursor = body.result_info?.cursor || null;
  } while (cursor);
  return keys;
}

async function getJson(ns, key) {
  const res = await fetch(`${base}/${ns}/values/${encodeURIComponent(key)}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get ${key} failed: ${res.status}`);
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function isoOr(value, fallback) {
  const d = new Date(value ?? '');
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

const now = new Date().toISOString();
/** email -> MailingListEntry */
const merged = new Map();
/** email -> original raw JSON string (to detect no-op writes) */
const original = new Map();

function fold(email, name, source, at) {
  const key = (email ?? '').trim().toLowerCase();
  if (!key.includes('@')) return false;
  const incoming = { name: (name ?? '').trim() || null, source, at };
  merged.set(key, mergeMailingListEntry(merged.get(key) ?? null, incoming));
  return true;
}

// 1. Existing mailing-list entries (form signups, possibly pre-source shape).
const mailingKeys = await listKeys(MAILING_LIST_NS);
for (const key of mailingKeys) {
  const raw = await getJson(MAILING_LIST_NS, key);
  original.set(key, JSON.stringify(raw));
  const entry = normalizeExisting(raw);
  if (entry) merged.set(key.trim().toLowerCase(), entry);
}

// 2. Square sale party records.
const guestKeys = await listKeys(GUESTLIST_NS);
let saleRecords = 0;
let saleNoEmail = 0;
for (const key of guestKeys.filter((k) => k.startsWith('party:'))) {
  const p = await getJson(GUESTLIST_NS, key);
  if (!p) continue;
  saleRecords += 1;
  const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  if (!fold(p.email, name, 'purchase', isoOr(p.purchasedAt, now))) saleNoEmail += 1;
}

// 3. Legacy CSV rosters (arrays of parties).
let importRecords = 0;
let importNoEmail = 0;
for (const key of guestKeys.filter((k) => k.startsWith('roster:'))) {
  const parties = await getJson(GUESTLIST_NS, key);
  if (!Array.isArray(parties)) continue;
  for (const p of parties) {
    importRecords += 1;
    const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
    if (!fold(p.email, name, 'import', isoOr(p.orderDate, now))) importNoEmail += 1;
  }
}

// Diff against what's stored so re-runs report (and write) nothing.
const writes = [];
let created = 0;
let updated = 0;
for (const [email, entry] of merged) {
  const value = JSON.stringify(entry);
  const before = original.get(email);
  if (before === undefined) created += 1;
  else if (before !== value) updated += 1;
  else continue;
  writes.push({ key: email, value });
}

const bySource = {};
for (const entry of merged.values()) {
  bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
}

console.log(`inputs: ${mailingKeys.length} existing entries, ${saleRecords} sale parties (${saleNoEmail} without email), ${importRecords} imported parties (${importNoEmail} without email)`);
console.log(`merged list: ${merged.size} unique emails`, bySource);
console.log(`writes needed: ${created} new, ${updated} updated, ${merged.size - created - updated} unchanged`);

if (!apply) {
  console.log('dry run — pass --apply to write');
  process.exit(0);
}

for (let i = 0; i < writes.length; i += 500) {
  const res = await fetch(`${base}/${MAILING_LIST_NS}/bulk`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(writes.slice(i, i + 500)),
  });
  const body = await res.json();
  if (!body.success) throw new Error(`bulk write failed: ${JSON.stringify(body.errors)}`);
}
console.log(`wrote ${writes.length} entries`);
