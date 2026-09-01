import { clearPasscode, getPasscode, UnauthorizedError } from './guestlist.ts';
import { apiUrl } from './api-base.ts';

/* Shapes mirror worker/src/sales.ts. */

export interface SalesByType {
  ticketType: string;
  tickets: number;
  grossCents: number;
}

export interface SalesLocation {
  /** Square location id; null when the venue location hasn't been created yet. */
  id: string | null;
  /** Display name ("The Moose", "Princeton Station"). */
  name: string;
  /** True when sales land at the account's default location rather than a venue one. */
  isDefault: boolean;
  /** True when the venue location will be created at the first sale (nothing minted yet). */
  pending: boolean;
}

export interface ShowSales {
  id: string;
  showName: string;
  startTime: string;
  endTime: string;
  venueName: string;
  venueAddress: string;
  capacity: number | null;
  soldOut: boolean;
  isPast: boolean;
  grossCents: number;
  tickets: number;
  parties: number;
  /** Tickets with no recorded amount and no matching ticket price — counted, not valued. */
  unpricedTickets: number;
  byType: SalesByType[];
  location: SalesLocation;
}

export interface SalesReport {
  generatedAt: string;
  totals: { grossCents: number; tickets: number; parties: number; shows: number };
  /** Every ticket type seen, in fixed display order (by overall gross, desc). */
  ticketTypes: string[];
  shows: ShowSales[];
}

export interface SalesBuyer {
  paymentId: string;
  firstName: string;
  lastName: string;
  email: string;
  quantity: number;
  ticketType: string;
  purchasedAt: string;
  /** Amount attributed to this order in cents; null when it couldn't be priced. */
  amountCents: number | null;
  /** True when the amount is the recorded checkout total rather than price × quantity. */
  recorded: boolean;
}

async function request<T>(path: string): Promise<T> {
  const passcode = getPasscode();
  if (!passcode) throw new UnauthorizedError();
  const res = await fetch(`${apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${passcode}` },
  });
  if (res.status === 401) {
    clearPasscode();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function getSalesReport(): Promise<SalesReport> {
  return request<SalesReport>('/api/admin/sales');
}

export async function getShowBuyers(eventId: string): Promise<SalesBuyer[]> {
  const data = await request<{ buyers: SalesBuyer[] }>(
    `/api/admin/sales/shows/${encodeURIComponent(eventId)}`,
  );
  return data.buyers;
}
