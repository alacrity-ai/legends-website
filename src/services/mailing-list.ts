const bookingApiUrl = import.meta.env.VITE_BOOKING_API_URL;

export async function joinMailingList(email: string, name?: string): Promise<void> {
  const res = await fetch(`${bookingApiUrl}/api/mailing-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: name || undefined }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to join mailing list');
  }
}
