import type { CheckinMap, Party } from '../types/guestlist.ts';

const apiUrl = import.meta.env.VITE_BOOKING_API_URL;
const PASSCODE_KEY = 'guestlist:passcode';

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export function getPasscode(): string | null {
  try {
    return localStorage.getItem(PASSCODE_KEY);
  } catch {
    return null;
  }
}

export function setPasscode(passcode: string): void {
  localStorage.setItem(PASSCODE_KEY, passcode);
}

export function clearPasscode(): void {
  localStorage.removeItem(PASSCODE_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const passcode = getPasscode();
  if (!passcode) throw new UnauthorizedError();

  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${passcode}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${apiUrl}${path}`, { ...init, headers });
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

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const res = await fetch(`${apiUrl}/api/guestlist/shows`, {
    headers: { Authorization: `Bearer ${passcode}` },
  });
  if (res.status === 401) return false;
  if (!res.ok) throw new Error(`Verify failed (${res.status})`);
  setPasscode(passcode);
  return true;
}

export async function listShows(): Promise<string[]> {
  const data = await request<{ shows: string[] }>('/api/guestlist/shows');
  return data.shows;
}

export interface ShowData {
  parties: Party[];
  checkedIn: CheckinMap;
}

export async function getShow(showId: string): Promise<ShowData> {
  return request<ShowData>(`/api/guestlist/shows/${encodeURIComponent(showId)}`);
}

export async function checkIn(showId: string, partyId: string): Promise<string> {
  const data = await request<{ checkedInAt: string }>(
    `/api/guestlist/shows/${encodeURIComponent(showId)}/checkin`,
    { method: 'POST', body: JSON.stringify({ partyId }) },
  );
  return data.checkedInAt;
}

export async function uncheck(showId: string, partyId: string): Promise<void> {
  await request<{ ok: true }>(
    `/api/guestlist/shows/${encodeURIComponent(showId)}/checkin`,
    { method: 'DELETE', body: JSON.stringify({ partyId }) },
  );
}
