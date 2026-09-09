/**
 * Public seating endpoints for the buyer sheet (v0.5 P3, LGD-17).
 *
 *   GET    /api/events/:id/seating?quantity=N        layout + availability + which tables fit N
 *   POST   /api/events/:id/seats/hold                choose seats FOR the party and hold them (one atomic step)
 *   DELETE /api/events/:id/seats/hold/:holdId        release
 *
 * The worker chooses seats from a fresh read of D1 and claims them
 * conditionally; a lost race is retried with a fresh read (up to 3×) before
 * answering 409. Nothing here is authenticated — like checkout today — and
 * every id is regex-validated before it touches storage.
 */
import type { Env, EventRecord } from '../types.ts';
import { NO_STORE, errorMessage, jsonResponse } from '../http.ts';
import { deactivatePaymentLink } from '../services/square.ts';
import { OBJECT_ID_RE } from '@seating/ids.ts';
import { objectCenter } from '@seating/geometry.ts';
import { chooseSeats, describeAssignment, objectFits, objectNoun, type Assignment } from '@seating/assign.ts';
import {
  HOLD_TTL_MS,
  availability,
  claimSeats,
  freeSeatIds,
  getHold,
  insertHold,
  markSuperseded,
  newHoldId,
  releaseHold,
} from './db.ts';

export const HOLD_ID_RE = /^h_[a-f0-9]{12}$/;
const MAX_QTY = 20;
const CLAIM_ATTEMPTS = 3;

export interface HoldResponse {
  holdId: string;
  expiresAt: number;
  seatIds: string[];
  seatLabels: string[];
  objects: Assignment['objects'];
  split: boolean;
  message: string;
  layout: EventRecord['seating'] extends infer S ? (S extends { layout: infer L } ? L : never) : never;
}

async function loadSeatedEvent(env: Env, id: string): Promise<EventRecord | null> {
  if (!/^[a-f0-9-]+$/.test(id)) return null;
  const raw = await env.EVENTS.get(`event:${id}`);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as EventRecord;
    return record.seating ? record : null;
  } catch {
    return null;
  }
}

/** Route seating requests; null = not a seating path. */
export async function handleSeatingPublic(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const seatingMatch = url.pathname.match(/^\/api\/events\/([a-f0-9-]+)\/seating$/);
  if (seatingMatch) {
    if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
    return handleGetSeating(seatingMatch[1], url, env, corsHeaders);
  }
  const holdMatch = url.pathname.match(/^\/api\/events\/([a-f0-9-]+)\/seats\/hold(?:\/(h_[a-f0-9]{12}))?$/);
  if (holdMatch) {
    if (request.method === 'POST' && !holdMatch[2]) return handleHold(holdMatch[1], request, env, ctx, corsHeaders);
    if (request.method === 'DELETE' && holdMatch[2]) return handleRelease(holdMatch[1], holdMatch[2], env, corsHeaders);
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }
  return null;
}

async function handleGetSeating(id: string, url: URL, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const event = await loadSeatedEvent(env, id);
  if (!event?.seating) return jsonResponse(404, { error: 'This show has no seating chart' }, corsHeaders);
  const q = Number(url.searchParams.get('quantity') ?? '1');
  const quantity = Number.isInteger(q) && q >= 1 && q <= MAX_QTY ? q : 1;

  const [seats, free] = await Promise.all([availability(env.SEATING, id), freeSeatIds(env.SEATING, id)]);
  const layout = event.seating.layout;
  const stage = layout.objects.find((o) => o.kind === 'stage');
  const stageCenter = stage ? objectCenter(stage) : { x: layout.canvas.width / 2, y: 0 };
  const tables = layout.objects
    .filter((o): o is Exclude<typeof o, { kind: 'stage' }> => o.kind !== 'stage')
    .map((o) => {
      const c = objectCenter(o);
      const freeCount = Array.from({ length: o.seats }, (_, i) => `${o.id}.${i + 1}`).filter((s) => free.has(s)).length;
      return {
        objectId: o.id,
        label: o.label,
        name: objectNoun(o),
        kind: o.kind,
        free: freeCount,
        fits: objectFits(o, free, quantity),
        distance: Math.round(Math.hypot(c.x - stageCenter.x, c.y - stageCenter.y)),
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return jsonResponse(200, { layout, seats, tables, quantity }, corsHeaders, NO_STORE);
}

interface HoldBody {
  ticketType: string;
  quantity: number;
  objectId?: string;
  replaceHoldId?: string;
}

function parseHoldBody(body: unknown): HoldBody {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('Invalid request body');
  const obj = body as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!['ticketType', 'quantity', 'objectId', 'replaceHoldId'].includes(key)) throw new Error(`Unexpected field: ${key}`);
  }
  const ticketType = typeof obj.ticketType === 'string' ? obj.ticketType.trim() : '';
  if (!ticketType) throw new Error('ticketType is required');
  const quantity = typeof obj.quantity === 'number' ? obj.quantity : NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) throw new Error(`quantity must be between 1 and ${MAX_QTY}`);
  const out: HoldBody = { ticketType, quantity };
  if (obj.objectId !== undefined && obj.objectId !== null) {
    if (typeof obj.objectId !== 'string' || !OBJECT_ID_RE.test(obj.objectId)) throw new Error('objectId is invalid');
    out.objectId = obj.objectId;
  }
  if (obj.replaceHoldId !== undefined && obj.replaceHoldId !== null) {
    if (typeof obj.replaceHoldId !== 'string' || !HOLD_ID_RE.test(obj.replaceHoldId)) throw new Error('replaceHoldId is invalid');
    out.replaceHoldId = obj.replaceHoldId;
  }
  return out;
}

async function handleHold(id: string, request: Request, env: Env, ctx: ExecutionContext, corsHeaders: Record<string, string>): Promise<Response> {
  let body: HoldBody;
  try {
    body = parseHoldBody(await request.json());
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }

  const event = await loadSeatedEvent(env, id);
  if (!event?.seating) return jsonResponse(404, { error: 'This show has no seating chart' }, corsHeaders);
  if (!event.tickets.some((t) => t.ticketType === body.ticketType)) return jsonResponse(404, { error: 'Unknown ticket type' }, corsHeaders);
  if (event.soldOut || new Date(event.endTime).getTime() < Date.now()) return jsonResponse(409, { error: 'Sold out' }, corsHeaders);

  const layout = event.seating.layout;
  const objectName = body.objectId
    ? (() => {
        const o = layout.objects.find((x) => x.id === body.objectId);
        return o && o.kind !== 'stage' ? objectNoun({ kind: o.kind, label: o.label }) : null;
      })()
    : null;
  if (body.objectId && !objectName) return jsonResponse(404, { error: 'Unknown table' }, corsHeaders);

  // Change table: let go of the previous hold first so its seats can be reused.
  if (body.replaceHoldId) {
    const prev = await getHold(env.SEATING, body.replaceHoldId);
    if (prev && prev.show_id === id && prev.status === 'active') await releaseHold(env.SEATING, prev.id);
  }

  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
    const now = Date.now();
    const free = await freeSeatIds(env.SEATING, id, now);
    const assignment = chooseSeats(layout, free, body.quantity, { objectId: body.objectId });
    if (!assignment) {
      const party = body.quantity === 1 ? 'one seat' : `a party of ${body.quantity}`;
      return jsonResponse(
        409,
        {
          error: objectName
            ? `${objectName} can't seat ${party} together — pick another table.`
            : `There are no seats left for ${party}. Try a smaller number of tickets.`,
        },
        corsHeaders,
        NO_STORE,
      );
    }

    const holdId = newHoldId();
    const expiresAt = now + HOLD_TTL_MS;
    await insertHold(env.SEATING, {
      id: holdId,
      show_id: id,
      seat_ids: JSON.stringify(assignment.seatIds),
      ticket_type: body.ticketType,
      quantity: body.quantity,
      status: 'active',
      expires_at: expiresAt,
      created_at: now,
      updated_at: now,
    });
    const claim = await claimSeats(env.SEATING, id, assignment.seatIds, holdId, expiresAt, now);
    if (!claim.ok) {
      await env.SEATING.prepare(`DELETE FROM seat_holds WHERE id = ?`).bind(holdId).run();
      continue; // someone got there first — choose again from a fresh read
    }
    if (claim.superseded.length) {
      await markSuperseded(env.SEATING, claim.superseded, now);
      ctx.waitUntil(deactivateSupersededLinks(env, claim.superseded));
    }

    const response: HoldResponse = {
      holdId,
      expiresAt,
      seatIds: assignment.seatIds,
      seatLabels: assignment.seatLabels,
      objects: assignment.objects,
      split: assignment.split,
      message: `We've saved seats for your party ${describeAssignment(assignment.objects)}.`,
      layout,
    };
    return jsonResponse(200, response as unknown as Record<string, unknown>, corsHeaders, NO_STORE);
  }
  return jsonResponse(409, { error: 'Seats are going fast — please try again.' }, corsHeaders, NO_STORE);
}

async function deactivateSupersededLinks(env: Env, holdIds: string[]): Promise<void> {
  for (const holdId of holdIds) {
    const hold = await getHold(env.SEATING, holdId);
    if (hold?.square_link_id) await deactivatePaymentLink(env, hold.square_link_id);
  }
}

async function handleRelease(id: string, holdId: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const hold = await getHold(env.SEATING, holdId);
  if (hold && hold.show_id === id && hold.status === 'active') await releaseHold(env.SEATING, holdId);
  return jsonResponse(200, { ok: true }, corsHeaders, NO_STORE);
}
