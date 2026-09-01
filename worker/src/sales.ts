import type { Env, EventRecord, PartyRecord } from './types.ts';

/* ── Sales report (LGD-10) ─────────────────────────────────────
 * Aggregates ticket sales from our own KV: EVENTS (shows + ticket prices)
 * and GUESTLIST (one `party:<eventId>:<paymentId>` per completed checkout).
 * Gross per order = the recorded checkout amount when the webhook captured
 * one, else the show's configured price × quantity. Orders with neither are
 * counted as tickets but carry no dollar value (`unpricedTickets`).
 * Refunds, Square fees and payouts are not modelled — that is Square's ledger.
 */

export type SalesByType = { ticketType: string; tickets: number; grossCents: number };

export type ShowSales = {
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
  unpricedTickets: number;
  byType: SalesByType[];
};

export type SalesReport = {
  generatedAt: string;
  totals: { grossCents: number; tickets: number; parties: number; shows: number };
  ticketTypes: string[];
  shows: ShowSales[];
};

export type SalesBuyer = {
  paymentId: string;
  firstName: string;
  lastName: string;
  email: string;
  quantity: number;
  ticketType: string;
  purchasedAt: string;
  amountCents: number | null;
  recorded: boolean;
};

async function listParties(env: Env, eventId: string): Promise<PartyRecord[]> {
  const list = await env.GUESTLIST.list({ prefix: `party:${eventId}:` });
  const raws = await Promise.all(list.keys.map((k) => env.GUESTLIST.get(k.name)));
  const parties: PartyRecord[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      parties.push(JSON.parse(raw) as PartyRecord);
    } catch {
      // skip malformed entry
    }
  }
  return parties;
}

function priceOrder(
  party: PartyRecord,
  prices: Map<string, number>,
): { amountCents: number | null; recorded: boolean } {
  if (typeof party.amountCents === 'number' && party.amountCents >= 0) {
    return { amountCents: party.amountCents, recorded: true };
  }
  const unit = prices.get(party.ticketType);
  if (unit === undefined) return { amountCents: null, recorded: false };
  return { amountCents: unit * party.quantity, recorded: false };
}

export async function buildSalesReport(env: Env, events: EventRecord[]): Promise<SalesReport> {
  const now = Date.now();

  const shows = await Promise.all(
    events.map(async (event): Promise<ShowSales> => {
      const parties = await listParties(env, event.id);
      const prices = new Map(event.tickets.map((t) => [t.ticketType, t.priceCents]));
      const byType = new Map<string, SalesByType>();
      let grossCents = 0;
      let tickets = 0;
      let unpricedTickets = 0;

      for (const party of parties) {
        const { amountCents } = priceOrder(party, prices);
        tickets += party.quantity;
        if (amountCents === null) unpricedTickets += party.quantity;
        else grossCents += amountCents;
        const type = party.ticketType || 'Ticket';
        const row = byType.get(type) ?? { ticketType: type, tickets: 0, grossCents: 0 };
        row.tickets += party.quantity;
        row.grossCents += amountCents ?? 0;
        byType.set(type, row);
      }

      return {
        id: event.id,
        showName: event.showName,
        startTime: event.startTime,
        endTime: event.endTime,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        capacity: event.capacity ?? null,
        soldOut: event.soldOut ?? false,
        isPast: new Date(event.endTime).getTime() < now,
        grossCents,
        tickets,
        parties: parties.length,
        unpricedTickets,
        byType: [...byType.values()],
      };
    }),
  );

  shows.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Fixed display order for ticket types: overall gross desc, then name — the
  // order is assigned once here so a type keeps its colour across every show.
  const typeTotals = new Map<string, number>();
  for (const s of shows) {
    for (const t of s.byType) typeTotals.set(t.ticketType, (typeTotals.get(t.ticketType) ?? 0) + t.grossCents);
  }
  const ticketTypes = [...typeTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type]) => type);
  for (const s of shows) {
    s.byType.sort((a, b) => ticketTypes.indexOf(a.ticketType) - ticketTypes.indexOf(b.ticketType));
  }

  const totals = shows.reduce(
    (acc, s) => ({
      grossCents: acc.grossCents + s.grossCents,
      tickets: acc.tickets + s.tickets,
      parties: acc.parties + s.parties,
      shows: acc.shows + 1,
    }),
    { grossCents: 0, tickets: 0, parties: 0, shows: 0 },
  );

  return { generatedAt: new Date().toISOString(), totals, ticketTypes, shows };
}

export async function buildShowBuyers(env: Env, event: EventRecord): Promise<{ buyers: SalesBuyer[] }> {
  const parties = await listParties(env, event.id);
  const prices = new Map(event.tickets.map((t) => [t.ticketType, t.priceCents]));
  const buyers: SalesBuyer[] = parties.map((p) => {
    const { amountCents, recorded } = priceOrder(p, prices);
    return {
      paymentId: p.paymentId,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      quantity: p.quantity,
      ticketType: p.ticketType,
      purchasedAt: p.purchasedAt,
      amountCents,
      recorded,
    };
  });
  buyers.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  return { buyers };
}
