import { clearPasscode, getPasscode, UnauthorizedError } from './guestlist.ts';
import { apiUrl } from './api-base.ts';
import type { ChartDraft, SeatingChart } from '@seating/types.ts';

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

/** A non-2xx reply, with the status and any structured details the worker sent. */
export class ChartApiError extends Error {
  status: number;
  details: Record<string, unknown> | undefined;
  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ChartApiError';
    this.status = status;
    this.details = details;
  }
  /** Validation messages from a 400, if any. */
  get errors(): string[] {
    const e = this.details?.errors;
    return Array.isArray(e) ? e.filter((x): x is string => typeof x === 'string') : [];
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const passcode = getPasscode();
  if (!passcode) throw new UnauthorizedError();

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${passcode}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${apiUrl}${path}`, { ...init, headers });
  if (res.status === 401) {
    clearPasscode();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; details?: Record<string, unknown> };
    throw new ChartApiError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  }
  return res.json() as Promise<T>;
}

export async function listCharts(): Promise<ChartSummary[]> {
  const data = await request<{ charts: ChartSummary[] }>('/api/admin/charts');
  return data.charts;
}

export async function getChart(id: string): Promise<SeatingChart> {
  const data = await request<{ chart: SeatingChart }>(`/api/admin/charts/${id}`);
  return data.chart;
}

export async function createChart(draft: ChartDraft): Promise<SeatingChart> {
  const data = await request<{ chart: SeatingChart }>('/api/admin/charts', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
  return data.chart;
}

/** Replace a chart; `revision` is the one the editor loaded (409 when it moved on). */
export async function updateChart(id: string, draft: ChartDraft, revision: number): Promise<SeatingChart> {
  const data = await request<{ chart: SeatingChart }>(`/api/admin/charts/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...draft, revision }),
  });
  return data.chart;
}

export async function duplicateChart(id: string): Promise<SeatingChart> {
  const data = await request<{ chart: SeatingChart }>(`/api/admin/charts/${id}/duplicate`, { method: 'POST' });
  return data.chart;
}

export async function deleteChart(id: string): Promise<void> {
  await request<{ ok: true }>(`/api/admin/charts/${id}`, { method: 'DELETE' });
}
