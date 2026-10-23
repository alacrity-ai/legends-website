/** Partial check-in arithmetic, shared by the door list, chart, stats and print sheet. */
import type { ArrivedMap, CheckinMap, Party } from '../../types/guestlist.ts';

/**
 * How many of each checked-in party are here. A check-in without a count
 * (older records, legacy CSV rosters) means the whole party; a count is never
 * more than the party still holds.
 */
export function arrivalCounts(parties: Party[], checkedIn: CheckinMap, arrived: ArrivedMap): ArrivedMap {
  const out: ArrivedMap = {};
  for (const p of parties) {
    if (!checkedIn[p.id]) continue;
    out[p.id] = Math.min(arrived[p.id] ?? p.quantity, p.quantity);
  }
  return out;
}

export interface ArrivalTotals {
  /** Parties with everyone here. */
  fullParties: number;
  /** Parties with some, not all, here. */
  partialParties: number;
  /** People here. */
  arrivedTickets: number;
}

export function arrivalTotals(parties: Party[], arrivals: ArrivedMap): ArrivalTotals {
  let fullParties = 0;
  let partialParties = 0;
  let arrivedTickets = 0;
  for (const p of parties) {
    const n = arrivals[p.id] ?? 0;
    arrivedTickets += n;
    if (n >= p.quantity) fullParties++;
    else if (n > 0) partialParties++;
  }
  return { fullParties, partialParties, arrivedTickets };
}
