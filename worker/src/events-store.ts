import type { Env, EventRecord } from './types.ts';

/** Every form-created event record in KV (`event:<id>`), malformed entries skipped. */
export async function listEventRecords(env: Env): Promise<EventRecord[]> {
  const list = await env.EVENTS.list({ prefix: 'event:' });
  const raws = await Promise.all(list.keys.map((k) => env.EVENTS.get(k.name)));
  const records: EventRecord[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as EventRecord);
    } catch {
      // skip malformed record
    }
  }
  return records;
}
