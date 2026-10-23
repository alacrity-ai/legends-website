/** Seat arithmetic for the door chart + stats row (kept out of the component file for fast refresh). */
import type { SeatingChart } from '@seating/types.ts';
import { allSeats } from '@seating/geometry.ts';
import type { ArrivedMap } from '../../types/guestlist.ts';
import type { SeatOccupancy } from '../../services/admin-events.ts';

export interface OccupancyCounts {
  total: number;
  sold: number;
  held: number;
  arrived: number;
}

/**
 * Seats to colour as arrived. Seats belong to a party, not to a person, so a
 * party with 1 of 3 here lights its first seat (in the layout's order).
 */
export function arrivedSeatIds(layout: SeatingChart, seats: Record<string, SeatOccupancy>, arrivals: ArrivedMap): Set<string> {
  const used: Record<string, number> = {};
  const out = new Set<string>();
  for (const s of allSeats(layout)) {
    const o = seats[s.id];
    if (o?.status !== 'sold' || !o.partyId) continue;
    const n = used[o.partyId] ?? 0;
    if (n < (arrivals[o.partyId] ?? 0)) out.add(s.id);
    used[o.partyId] = n + 1;
  }
  return out;
}

export function occupancyCounts(layout: SeatingChart, seats: Record<string, SeatOccupancy>, arrivals: ArrivedMap): OccupancyCounts {
  let sold = 0;
  let held = 0;
  for (const s of allSeats(layout)) {
    const o = seats[s.id];
    if (!o) continue;
    if (o.status === 'sold') sold++;
    else if (o.status === 'held') held++;
  }
  return { total: allSeats(layout).length, sold, held, arrived: arrivedSeatIds(layout, seats, arrivals).size };
}
