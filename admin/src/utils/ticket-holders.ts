import type { Party } from '../types/guestlist.ts';
import { slugify } from './qr.ts';

/** "+19787583536" → "(978) 758-3536"; anything else is left as typed. */
function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const us = phone.replace(/[^\d]/g, '').match(/^1?(\d{3})(\d{3})(\d{4})$/);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : phone;
}

/** Quote every cell, and keep a spreadsheet from running a cell that starts like a formula. */
function cell(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? ` ${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Who holds tickets to a show, for working through refunds: one row per order,
 * with the Square payment id so the refund can be found in the dashboard.
 */
export function ticketHoldersCsv(parties: Party[]): string {
  const rows: Array<Array<string | number | null>> = [
    ['Name', 'Email', 'Phone', 'Tickets', 'Ticket', 'Ordered', 'Square payment id'],
    ...parties.map((p) => [
      `${p.firstName} ${p.lastName}`.trim(),
      p.email,
      formatPhone(p.phone),
      p.quantity,
      p.notes,
      p.orderDate.slice(0, 10),
      p.id,
    ]),
  ];
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

function downloadCsv(csv: string, filename: string): void {
  // The BOM makes Excel read the file as UTF-8 (names with accents).
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadTicketHolders(show: { showName: string; startTime: string }, parties: Party[]): void {
  downloadCsv(ticketHoldersCsv(parties), `ticket-holders-${slugify(show.showName)}-${show.startTime.slice(0, 10)}.csv`);
}
