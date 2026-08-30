import { clearPasscode, getPasscode, UnauthorizedError } from './guestlist.ts';

import { apiUrl } from './api-base.ts';

export type SubscriberSource = 'signup' | 'purchase' | 'import';

export interface Subscriber {
  email: string;
  name: string | null;
  source: SubscriberSource;
  /** Present when the person explicitly signed up via the site form. */
  signedUpAt?: string;
  addedAt: string;
  updatedAt: string;
  /** Present when the person unsubscribed — never email them. */
  unsubscribedAt?: string;
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
    ['name', 'email', 'source', 'signed_up_at', 'added_at', 'updated_at', 'unsubscribed_at'],
    ...subscribers.map((s) => [
      s.name,
      s.email,
      s.source,
      s.signedUpAt,
      s.addedAt,
      s.updatedAt,
      s.unsubscribedAt,
    ]),
  ];
  return rows.map((r) => r.map(quote).join(',')).join('\r\n');
}
