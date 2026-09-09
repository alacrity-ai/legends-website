/**
 * Attach / detach / re-sync a seating chart on a show (v0.5 P2, LGD-16).
 *
 * Attaching SNAPSHOTS the layout into `event.seating` and materializes one
 * D1 row per seat. Later edits to the master chart never touch the show;
 * "re-sync" re-snapshots the master and is only allowed while `sold = 0`.
 * Order of writes is D1 first, then the caller persists the KV record — a
 * KV failure leaves a superset in D1 that the next attach reconciles
 * (`INSERT OR IGNORE`) and a delete clears.
 */
import type { Env, EventRecord } from '../types.ts';
import { readChart } from '../charts.ts';
import { seatCount, validateChart } from '@seating/index.ts';
import { deleteShowSeats, materializeSeats } from './db.ts';

export class AttachError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AttachError';
    this.status = status;
  }
}

function soldCount(record: EventRecord): number {
  return record.sold ?? 0;
}

/** The show has sold tickets: seating cannot change. */
export function assertSeatingMutable(record: EventRecord): void {
  const sold = soldCount(record);
  if (record.seating && sold > 0) {
    throw new AttachError(409, `This show has sold ${sold} ticket${sold === 1 ? '' : 's'}; seating cannot be changed.`);
  }
}

/**
 * Snapshot chart `chartId` onto `record` and materialize its seats. Returns
 * the updated record (not yet written to KV). Any previously attached seats
 * are dropped first so a chart swap never leaves stale rows behind.
 */
export async function attachChart(env: Env, record: EventRecord, chartId: string): Promise<EventRecord> {
  const chart = await readChart(env, chartId);
  if (!chart) throw new AttachError(404, 'Seating chart not found');
  const result = validateChart(chart);
  if (!result.ok) throw new AttachError(400, `Seating chart is invalid: ${result.errors[0]}`);
  const seats = seatCount(chart);
  if (seats < 1) throw new AttachError(400, 'Seating chart has no seats');

  if (record.seating) await deleteShowSeats(env.SEATING, record.id);
  await materializeSeats(env.SEATING, record.id, chart);

  const sold = soldCount(record);
  return {
    ...record,
    capacity: seats,
    soldOut: sold >= seats,
    seating: {
      chartId: chart.id,
      chartName: chart.name,
      chartRevision: chart.revision,
      seatCount: seats,
      attachedAt: new Date().toISOString(),
      layout: chart,
    },
  };
}

/** Drop the snapshot and the show's seat rows; capacity is left as-is for the admin to edit. */
export async function detachChart(env: Env, record: EventRecord): Promise<EventRecord> {
  if (!record.seating) return record;
  await deleteShowSeats(env.SEATING, record.id);
  const next: EventRecord = { ...record };
  delete next.seating;
  return next;
}

/** Re-snapshot the current master layout (only while nothing has sold). */
export async function resyncChart(env: Env, record: EventRecord): Promise<EventRecord> {
  if (!record.seating) throw new AttachError(400, 'This show has no seating chart');
  assertSeatingMutable(record);
  return attachChart(env, record, record.seating.chartId);
}

/** The admin list omits the layout snapshot (size); the single-event GET keeps it. */
export function stripLayout(record: EventRecord): EventRecord {
  if (!record.seating) return record;
  const { chartId, chartName, chartRevision, seatCount, attachedAt } = record.seating;
  return { ...record, seating: { chartId, chartName, chartRevision, seatCount, attachedAt } as EventRecord['seating'] };
}
