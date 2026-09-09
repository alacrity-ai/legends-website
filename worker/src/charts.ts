/**
 * Admin seating-chart layouts (v0.5 P1, LGD-15). A layout is one JSON
 * document in KV `EVENTS` under `chart:<id>`; shows snapshot it on attach
 * (P2), so editing a layout never changes a selling show.
 *
 *   GET    /api/admin/charts                 list (+ seatCount, objectSummary, usedBy)
 *   POST   /api/admin/charts                 create { name, canvas, objects }
 *   GET    /api/admin/charts/:id             full document
 *   PUT    /api/admin/charts/:id             replace; body carries `revision` → 409 on mismatch
 *   POST   /api/admin/charts/:id/duplicate   copy named "Copy of …"
 *   DELETE /api/admin/charts/:id             409 while an upcoming show uses it
 */
import type { Env, EventRecord } from './types.ts';
import { NO_STORE, adminPasscode, errorMessage, isAuthorized, jsonResponse } from './http.ts';
import { listEventRecords } from './events-store.ts';
import {
  CHART_ID_RE,
  CHART_SCHEMA_VERSION,
  newChartId,
  parseChartDraft,
  seatCount,
  validateChart,
  type ChartDraft,
  type ChartObject,
  type SeatingChart,
} from '@seating/index.ts';

const CHART_PREFIX = 'chart:';

export interface ChartUsedBy {
  eventId: string;
  showName: string;
  startTime: string;
}

export interface ChartSummary {
  id: string;
  name: string;
  seatCount: number;
  objectSummary: string;
  revision: number;
  updatedAt: string;
  usedBy: ChartUsedBy[];
}

export async function handleAdminCharts(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!isAuthorized(request, adminPasscode(env))) {
    return jsonResponse(401, { error: 'Unauthorized' }, corsHeaders);
  }

  if (url.pathname === '/api/admin/charts') {
    if (request.method === 'GET') return listCharts(env, corsHeaders);
    if (request.method === 'POST') return createChart(request, env, corsHeaders);
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }

  const m = url.pathname.match(/^\/api\/admin\/charts\/(c_[a-f0-9]{8})(?:\/(duplicate))?$/);
  if (!m) return jsonResponse(404, { error: 'Not found' }, corsHeaders);
  const id = m[1];
  const sub = m[2];

  if (sub === 'duplicate') {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
    return duplicateChart(id, env, corsHeaders);
  }
  if (request.method === 'GET') return getChart(id, env, corsHeaders);
  if (request.method === 'PUT') return updateChart(id, request, env, corsHeaders);
  if (request.method === 'DELETE') return deleteChart(id, env, corsHeaders);
  return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
}

/* ── storage ─────────────────────────────────────────────────── */

async function readChart(env: Env, id: string): Promise<SeatingChart | null> {
  if (!CHART_ID_RE.test(id)) return null;
  const raw = await env.EVENTS.get(`${CHART_PREFIX}${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SeatingChart;
  } catch {
    return null;
  }
}

async function writeChart(env: Env, chart: SeatingChart): Promise<void> {
  await env.EVENTS.put(`${CHART_PREFIX}${chart.id}`, JSON.stringify(chart));
}

export async function listChartRecords(env: Env): Promise<SeatingChart[]> {
  const list = await env.EVENTS.list({ prefix: CHART_PREFIX });
  const raws = await Promise.all(list.keys.map((k) => env.EVENTS.get(k.name)));
  const charts: SeatingChart[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      charts.push(JSON.parse(raw) as SeatingChart);
    } catch {
      // skip malformed chart
    }
  }
  charts.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return charts;
}

/** Upcoming shows that snapshotted this chart. Past shows keep their own copy and never block. */
function usedByUpcoming(events: EventRecord[], chartId: string): ChartUsedBy[] {
  const now = Date.now();
  return events
    .filter((e) => e.seating?.chartId === chartId && new Date(e.endTime).getTime() >= now)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((e) => ({ eventId: e.id, showName: e.showName, startTime: e.startTime }));
}

export function objectSummary(objects: ChartObject[]): string {
  const counts = { round: 0, rect: 0, row: 0, stage: 0 };
  for (const o of objects) counts[o.kind]++;
  const parts: string[] = [];
  if (counts.round) parts.push(`${counts.round} round`);
  if (counts.rect) parts.push(`${counts.rect} rect`);
  if (counts.row) parts.push(`${counts.row} row${counts.round + counts.rect === 0 && counts.row > 1 ? 's' : ''}`);
  if (counts.stage) parts.push('stage');
  return parts.length ? parts.join(' · ') : 'empty';
}

function summarize(chart: SeatingChart, events: EventRecord[]): ChartSummary {
  return {
    id: chart.id,
    name: chart.name,
    seatCount: seatCount(chart),
    objectSummary: objectSummary(chart.objects),
    revision: chart.revision,
    updatedAt: chart.updatedAt,
    usedBy: usedByUpcoming(events, chart.id),
  };
}

/** Case-insensitive name clash against every other chart. */
function nameTaken(charts: SeatingChart[], name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return charts.some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === key);
}

/** Parse + validate a draft body; returns a Response on failure. */
async function readDraft(request: Request, corsHeaders: Record<string, string>): Promise<
  { draft: ChartDraft; revision: number | null } | Response
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' }, corsHeaders);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Invalid JSON body' }, corsHeaders);
  }
  const { revision, ...rest } = body as Record<string, unknown>;
  let draft: ChartDraft;
  try {
    draft = parseChartDraft(rest);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }
  const result = validateChart(draft);
  if (!result.ok) {
    return jsonResponse(400, { error: 'Invalid chart', details: { errors: result.errors } }, corsHeaders);
  }
  if (revision !== undefined && (typeof revision !== 'number' || !Number.isInteger(revision))) {
    return jsonResponse(400, { error: 'revision must be an integer' }, corsHeaders);
  }
  return { draft, revision: typeof revision === 'number' ? revision : null };
}

/* ── handlers ────────────────────────────────────────────────── */

async function listCharts(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const [charts, events] = await Promise.all([listChartRecords(env), listEventRecords(env)]);
  return jsonResponse(200, { charts: charts.map((c) => summarize(c, events)) }, corsHeaders, NO_STORE);
}

async function createChart(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const parsed = await readDraft(request, corsHeaders);
  if (parsed instanceof Response) return parsed;
  const { draft } = parsed;

  const charts = await listChartRecords(env);
  if (nameTaken(charts, draft.name)) {
    return jsonResponse(409, { error: `A chart named "${draft.name}" already exists` }, corsHeaders);
  }

  const now = new Date().toISOString();
  const chart: SeatingChart = {
    id: newChartId(),
    ...draft,
    version: CHART_SCHEMA_VERSION,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await writeChart(env, chart);
  return jsonResponse(200, { chart }, corsHeaders, NO_STORE);
}

async function getChart(id: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const chart = await readChart(env, id);
  if (!chart) return jsonResponse(404, { error: 'Chart not found' }, corsHeaders);
  return jsonResponse(200, { chart }, corsHeaders, NO_STORE);
}

async function updateChart(
  id: string,
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const existing = await readChart(env, id);
  if (!existing) return jsonResponse(404, { error: 'Chart not found' }, corsHeaders);

  const parsed = await readDraft(request, corsHeaders);
  if (parsed instanceof Response) return parsed;
  const { draft, revision } = parsed;

  if (revision === null) {
    return jsonResponse(400, { error: 'revision is required' }, corsHeaders);
  }
  if (revision !== existing.revision) {
    return jsonResponse(
      409,
      { error: 'This chart changed elsewhere', details: { revision: existing.revision } },
      corsHeaders,
      NO_STORE,
    );
  }

  const charts = await listChartRecords(env);
  if (nameTaken(charts, draft.name, id)) {
    return jsonResponse(409, { error: `A chart named "${draft.name}" already exists` }, corsHeaders);
  }

  const chart: SeatingChart = {
    ...existing,
    ...draft,
    version: CHART_SCHEMA_VERSION,
    revision: existing.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeChart(env, chart);
  return jsonResponse(200, { chart }, corsHeaders, NO_STORE);
}

async function duplicateChart(id: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const source = await readChart(env, id);
  if (!source) return jsonResponse(404, { error: 'Chart not found' }, corsHeaders);

  const charts = await listChartRecords(env);
  let name = `Copy of ${source.name}`.slice(0, 60);
  for (let n = 2; nameTaken(charts, name); n++) {
    const suffix = ` (${n})`;
    name = `Copy of ${source.name}`.slice(0, 60 - suffix.length) + suffix;
  }

  const now = new Date().toISOString();
  const chart: SeatingChart = {
    id: newChartId(),
    name,
    canvas: source.canvas,
    objects: source.objects,
    version: CHART_SCHEMA_VERSION,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  await writeChart(env, chart);
  return jsonResponse(200, { chart }, corsHeaders, NO_STORE);
}

async function deleteChart(id: string, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const chart = await readChart(env, id);
  if (!chart) return jsonResponse(404, { error: 'Chart not found' }, corsHeaders);

  const events = await listEventRecords(env);
  const usedBy = usedByUpcoming(events, id);
  if (usedBy.length > 0) {
    const names = usedBy.map((u) => u.showName).join(', ');
    return jsonResponse(
      409,
      { error: `"${chart.name}" is used by an upcoming show (${names}). Detach it there first.`, details: { usedBy } },
      corsHeaders,
    );
  }

  await env.EVENTS.delete(`${CHART_PREFIX}${id}`);
  return jsonResponse(200, { ok: true }, corsHeaders, NO_STORE);
}
