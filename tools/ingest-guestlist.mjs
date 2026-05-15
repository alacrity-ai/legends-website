#!/usr/bin/env node
// Parse a Square orders CSV and upload it as the roster for a show.
//
// Usage:
//   node tools/ingest-guestlist.mjs --csv <file> --show YYYY-MM-DD [--remote]
//
// Without --remote, writes to the local wrangler KV. With --remote, writes to production.
// Requires CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) in env when using --remote.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--csv') args.csv = argv[++i];
    else if (a === '--show') args.show = argv[++i];
    else if (a === '--remote') args.remote = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  console.log(`Usage: node tools/ingest-guestlist.mjs --csv <file> --show YYYY-MM-DD [--remote] [--dry-run]`);
}

// RFC 4180-ish CSV parser. Handles quoted fields with embedded commas, newlines, and "" escapes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += c;
        i++;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function splitName(full) {
  const cleaned = (full || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function normalizeVariation(raw) {
  const v = (raw || '').trim();
  if (v === 'Show and Meal') return 'Show and Meal';
  if (v === 'Show Only') return 'Show Only';
  return 'Unknown';
}

function partyId(showId, groupKey) {
  return createHash('sha1').update(`${showId}|${groupKey}`).digest('hex').slice(0, 12);
}

const VARIATION_ORDER = { 'Show and Meal': 0, 'Show Only': 1, 'Unknown': 2 };

function sortPurchases(purchases) {
  return [...purchases].sort(
    (a, b) => (VARIATION_ORDER[a.variation] ?? 99) - (VARIATION_ORDER[b.variation] ?? 99),
  );
}

function rowsToParties(showId, rows) {
  if (rows.length === 0) throw new Error('CSV is empty');
  const header = rows[0].map((h) => h.trim());
  const idx = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`CSV missing column: ${name}`);
    return i;
  };
  const cols = {
    name: idx('Recipient Name'),
    email: idx('Recipient Email'),
    phone: idx('Recipient Phone'),
    qty: idx('Item Quantity'),
    variation: idx('Item Variation'),
    orderDate: idx('Order Date'),
    notes: idx('Fulfillment Notes'),
  };

  const groups = new Map();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((v) => v.trim() === '')) continue;

    const fullName = (row[cols.name] || '').trim();
    const email = (row[cols.email] || '').trim();
    if (!fullName && !email) continue;

    const phoneRaw = (row[cols.phone] || '').trim();
    const qtyRaw = (row[cols.qty] || '').trim();
    const orderDate = (row[cols.orderDate] || '').trim();
    const { firstName, lastName } = splitName(fullName);
    const quantity = Number.parseInt(qtyRaw, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      console.warn(`Skipping row ${r + 1}: invalid quantity "${qtyRaw}"`);
      continue;
    }
    const variation = normalizeVariation(row[cols.variation]);
    const notes = (row[cols.notes] || '').trim();

    // Group by lowercased email; fallback to name+orderDate so empty-email rows don't merge.
    const groupKey = email
      ? email.toLowerCase()
      : `noemail|${fullName.toLowerCase()}|${orderDate}`;

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        groupKey,
        firstName,
        lastName,
        email,
        phone: phoneRaw || null,
        orderDate,
        purchasesByVariation: new Map([[variation, quantity]]),
        notes: notes ? new Set([notes]) : new Set(),
      });
    } else {
      // Aggregate quantity for this variation
      const current = existing.purchasesByVariation.get(variation) ?? 0;
      existing.purchasesByVariation.set(variation, current + quantity);
      // Keep earliest orderDate (lexicographic on YYYY/MM/DD works)
      if (orderDate && (!existing.orderDate || orderDate < existing.orderDate)) {
        existing.orderDate = orderDate;
      }
      // Fill in phone if we didn't have one yet
      if (!existing.phone && phoneRaw) existing.phone = phoneRaw;
      // Accumulate unique notes
      if (notes) existing.notes.add(notes);
    }
  }

  const parties = [];
  for (const g of groups.values()) {
    const purchases = sortPurchases(
      [...g.purchasesByVariation.entries()].map(([variation, quantity]) => ({
        variation,
        quantity,
      })),
    );
    const totalQuantity = purchases.reduce((s, p) => s + p.quantity, 0);
    const notesArr = [...g.notes];
    parties.push({
      id: partyId(showId, g.groupKey),
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone,
      quantity: totalQuantity,
      purchases,
      orderDate: g.orderDate,
      notes: notesArr.length > 0 ? notesArr.join(' · ') : null,
    });
  }

  parties.sort((a, b) => {
    const k = a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
    if (k !== 0) return k;
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
  });

  return parties;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.csv || !args.show) {
    usage();
    process.exit(args.help ? 0 : 1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.show)) {
    console.error('--show must be YYYY-MM-DD');
    process.exit(1);
  }

  const here = fileURLToPath(new URL('.', import.meta.url));
  const csvPath = args.csv.startsWith('/') ? args.csv : join(here, '..', args.csv);
  const text = readFileSync(csvPath, 'utf8');
  const rows = parseCsv(text);
  const parties = rowsToParties(args.show, rows);

  const totalTickets = parties.reduce((sum, p) => sum + p.quantity, 0);
  console.log(`Parsed ${parties.length} parties (${totalTickets} tickets) for show ${args.show}`);

  if (args.dryRun) {
    console.log(JSON.stringify(parties, null, 2));
    return;
  }

  const json = JSON.stringify(parties);
  const tmp = mkdtempSync(join(tmpdir(), 'roster-'));
  const tmpFile = join(tmp, 'roster.json');
  writeFileSync(tmpFile, json);

  const wranglerCwd = join(here, '..', 'worker');
  const cmd = [
    'wrangler', 'kv', 'key', 'put',
    `roster:${args.show}`,
    '--binding', 'GUESTLIST',
    '--path', tmpFile,
  ];
  if (args.remote) cmd.push('--remote');
  // Disambiguate which namespace id wrangler uses when both id and preview_id are set.
  cmd.push(args.remote ? '--preview=false' : '--preview');

  console.log(`> npx ${cmd.join(' ')}  (cwd=${wranglerCwd})`);
  const result = spawnSync('npx', cmd, {
    cwd: wranglerCwd,
    stdio: 'inherit',
    env: process.env,
  });
  rmSync(tmp, { recursive: true, force: true });

  if (result.status !== 0) {
    console.error(`wrangler exited with status ${result.status}`);
    process.exit(result.status ?? 1);
  }
  console.log(`Uploaded roster:${args.show} (${args.remote ? 'production' : 'local'}).`);
}

main();
