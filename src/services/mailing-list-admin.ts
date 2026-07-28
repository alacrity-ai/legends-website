import { clearPasscode, getPasscode, UnauthorizedError } from './guestlist.ts';

const apiUrl = import.meta.env.VITE_BOOKING_API_URL;

export type SubscriberSource = 'signup' | 'purchase' | 'import';

export interface Subscriber {
  email: string;
  name: string | null;
  source: SubscriberSource;
  /** Present when the person explicitly signed up via the site form. */
  signedUpAt?: string;
  addedAt: string;
  updatedAt: string;
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const passcode = getPasscode();
  if (!passcode) throw new UnauthorizedError();

  const res = await fetch(`${apiUrl}/api/admin/mailing-list`, {
    headers: { Authorization: `Bearer ${passcode}` },
  });

  if (res.status === 401) {
    clearPasscode();
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }

  const data = (await res.json()) as { subscribers: Subscriber[] };
  return data.subscribers;
}

/** Serialize subscribers to CSV (Excel-friendly, all fields quoted). */
export function subscribersToCsv(subscribers: Subscriber[]): string {
  const quote = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['name', 'email', 'source', 'signed_up_at', 'added_at', 'updated_at'],
    ...subscribers.map((s) => [s.name, s.email, s.source, s.signedUpAt, s.addedAt, s.updatedAt]),
  ];
  return rows.map((r) => r.map(quote).join(',')).join('\r\n');
}
