import type { CheckinMap, Party, TicketVariation } from '../../types/guestlist.ts';

/** What the printed door sheet needs beyond the roster itself. */
export interface PrintSheetOptions {
  /** Show name (or formatted date for legacy CSV rosters). */
  title: string;
  /** Date/time/venue line under the title; null when unknown (legacy rosters). */
  subtitle: string | null;
  parties: Party[];
  checkedIn: CheckinMap;
}

const WALK_UP_ROWS = 4;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeLabel(party: Party): string {
  if (party.purchases.length === 0) return 'Ticket';
  if (party.purchases.length > 1) return 'Mixed';
  const v = party.purchases[0].variation;
  if (v === 'Show and Meal') return 'Meal + Show';
  if (v === 'Show Only') return 'Show Only';
  return 'Ticket';
}

function breakdownWord(v: TicketVariation): string {
  if (v === 'Show and Meal') return 'meal';
  if (v === 'Show Only') return 'show';
  return 'other';
}

/** "2 meal / 4 show" for mixed parties; null otherwise. */
function mixedBreakdown(party: Party): string | null {
  if (party.purchases.length < 2) return null;
  return party.purchases
    .map((p) => `${p.quantity} ${breakdownWord(p.variation)}`)
    .join(' / ');
}

function formatTime(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function sortedByLastName(parties: Party[]): Party[] {
  return [...parties].sort((a, b) => {
    const aKey = `${a.lastName} ${a.firstName}`.trim() || a.email;
    const bKey = `${b.lastName} ${b.firstName}`.trim() || b.email;
    return aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
  });
}

function partyRow(party: Party, checkedInAt: string | undefined): string {
  const name =
    `${party.lastName}, ${party.firstName}`.replace(/^, |, $/, '').trim() ||
    party.email;
  const noteBits: string[] = [];
  const breakdown = mixedBreakdown(party);
  if (breakdown) noteBits.push(breakdown);
  if (checkedInAt) {
    const at = formatTime(checkedInAt);
    noteBits.push(at ? `checked in ${at}` : 'checked in');
  }
  if (party.notes) noteBits.push(party.notes);
  return `
      <tr>
        <td class="box-cell"><span class="box">${checkedInAt ? '&#10003;' : ''}</span></td>
        <td class="name">${escapeHtml(name)}</td>
        <td class="qty">${party.quantity}</td>
        <td>${typeLabel(party)}</td>
        <td class="arrived"><span class="blank"></span> of ${party.quantity}</td>
        <td class="notes">${escapeHtml(noteBits.join(' · '))}</td>
      </tr>`;
}

function walkUpRow(): string {
  return `
      <tr>
        <td class="box-cell"><span class="box"></span></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="arrived"><span class="blank"></span> of ___</td>
        <td></td>
      </tr>`;
}

export function buildSheetHtml(opts: PrintSheetOptions): string {
  const parties = sortedByLastName(opts.parties);
  const totalTickets = parties.reduce((s, p) => s + p.quantity, 0);
  const printedAt = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Door check-in — ${escapeHtml(opts.title)}</title>
<style>
  @page { size: letter portrait; margin: 0.5in; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #000;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.35;
  }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.14em; font-size: 8pt; margin: 0 0 2pt; }
  h1 { font-size: 16pt; margin: 0 0 2pt; }
  .subtitle { margin: 0; font-size: 10.5pt; }
  .meta { display: flex; justify-content: space-between; margin: 4pt 0 8pt; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td {
    border: 1pt solid #888;
    padding: 3pt 6pt;
    height: 0.32in;
    text-align: left;
    vertical-align: middle;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  thead th {
    height: auto;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 2pt solid #000;
  }
  tr { break-inside: avoid; }
  .col-in { width: 0.5in; }
  .col-qty { width: 0.65in; }
  .col-type { width: 1.05in; }
  .col-arrived { width: 0.95in; }
  .col-name { width: 2.1in; }
  .box-cell, .qty { text-align: center; }
  .name { font-weight: 600; }
  .box {
    display: inline-block;
    width: 13pt;
    height: 13pt;
    border: 1.5pt solid #000;
    border-radius: 2pt;
    line-height: 13pt;
    font-size: 11pt;
    text-align: center;
    vertical-align: middle;
  }
  .blank { display: inline-block; width: 0.32in; border-bottom: 1pt solid #000; vertical-align: baseline; }
  .notes { font-size: 9pt; }
  .walkups td {
    height: auto;
    border-bottom: 2pt solid #000;
    font-size: 8.5pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
</head>
<body>
  <p class="eyebrow">DJKMD Legends — Door Check-in</p>
  <h1>${escapeHtml(opts.title)}</h1>
  ${opts.subtitle ? `<p class="subtitle">${escapeHtml(opts.subtitle)}</p>` : ''}
  <div class="meta">
    <span>${parties.length} ${parties.length === 1 ? 'party' : 'parties'} &middot; ${totalTickets} ${totalTickets === 1 ? 'ticket' : 'tickets'}</span>
    <span>Printed ${escapeHtml(printedAt)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th class="col-in">In</th>
        <th class="col-name">Guest (last, first)</th>
        <th class="col-qty">Tickets</th>
        <th class="col-type">Type</th>
        <th class="col-arrived">Arrived</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${parties.map((p) => partyRow(p, opts.checkedIn[p.id])).join('')}
      <tr class="walkups"><td colspan="6">Walk-ups / door sales</td></tr>${Array.from({ length: WALK_UP_ROWS }, walkUpRow).join('')}
    </tbody>
  </table>
</body>
</html>`;
}

/**
 * Print the door sheet through a hidden same-origin iframe so the dark admin
 * UI's styles never bleed into the printout. The iframe is removed once the
 * print dialog closes (with a timed fallback for browsers that never fire
 * afterprint).
 */
export function printCheckinSheet(opts: PrintSheetOptions): void {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  frame.srcdoc = buildSheetHtml(opts);
  frame.addEventListener('load', () => {
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return;
    }
    win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 0));
    win.focus();
    win.print();
  });
  setTimeout(() => frame.remove(), 5 * 60_000);
  document.body.appendChild(frame);
}
