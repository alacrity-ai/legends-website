/** Seat arithmetic for the door chart + stats row (kept out of the component file for fast refresh). */
import type { SeatingChart } from '@seating/types.ts';
import { allSeats } from '@seating/geometry.ts';
import type { CheckinMap } from '../../types/guestlist.ts';
import type { SeatOccupancy } from '../../services/admin-events.ts';

export interface OccupancyCounts {
  total: number;
  sold: number;
  held: number;
  arrived: number;
}

export function occupancyCounts(layout: SeatingChart, seats: Record<string, SeatOccupancy>, checkedIn: CheckinMap): OccupancyCounts {
  let sold = 0;
  let held = 0;
  let arrived = 0;
  for (const s of allSeats(layout)) {
    const o = seats[s.id];
    if (!o) continue;
    if (o.status === 'sold') {
      sold++;
      if (o.partyId && checkedIn[o.partyId]) arrived++;
    } else if (o.status === 'held') held++;
  }
  return { total: allSeats(layout).length, sold, held, arrived };
}

