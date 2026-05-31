import type { Env } from '../types.ts';

const SQUARE_API_VERSION = '2025-01-23';

function apiBase(env: Env): string {
  return env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

function requireSecrets(env: Env): { token: string; locationId: string } {
  if (!env.SQUARE_ACCESS_TOKEN) throw new Error('SQUARE_ACCESS_TOKEN not set');
  if (!env.SQUARE_LOCATION_ID) throw new Error('SQUARE_LOCATION_ID not set');
  return { token: env.SQUARE_ACCESS_TOKEN, locationId: env.SQUARE_LOCATION_ID };
}

export interface CreatePaymentLinkInput {
  eventId: string;
  ticketType: string;
  itemName: string;
  amountCents: number;
  redirectUrl: string;
}

export interface CreatePaymentLinkResult {
  checkoutUrl: string;
  paymentLinkId: string;
  orderId: string;
}

/**
 * Create one Square hosted-checkout payment link for a single ticket type,
 * using the quick_pay flow (single price). One link per ticket type; the site
 * renders one Buy button per link.
 */
export async function createPaymentLink(
  env: Env,
  input: CreatePaymentLinkInput,
): Promise<CreatePaymentLinkResult> {
  const { token, locationId } = requireSecrets(env);

  const body = {
    idempotency_key: crypto.randomUUID(),
    quick_pay: {
      name: input.itemName,
      price_money: {
        amount: input.amountCents,
        currency: 'USD',
      },
      location_id: locationId,
    },
    checkout_options: {
      redirect_url: input.redirectUrl,
      ask_for_shipping_address: false,
    },
    payment_note: `legends-event:${input.eventId}:${input.ticketType}`,
  };

  const res = await fetch(`${apiBase(env)}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    payment_link?: { id: string; url: string; order_id: string };
    errors?: Array<{ detail: string; code?: string }>;
  };

  if (!res.ok || !json.payment_link) {
    const message = json.errors?.map((e) => e.detail).join('; ') ?? `Square error ${res.status}`;
    throw new Error(message);
  }

  return {
    checkoutUrl: json.payment_link.url,
    paymentLinkId: json.payment_link.id,
    orderId: json.payment_link.order_id,
  };
}

/**
 * Best-effort deactivation of a payment link. Used to clean up links created
 * earlier in a request that ultimately failed, and on event deletion.
 * Never throws — callers treat cleanup as best-effort.
 */
export async function deactivatePaymentLink(env: Env, paymentLinkId: string): Promise<void> {
  try {
    const { token } = requireSecrets(env);
    await fetch(`${apiBase(env)}/v2/online-checkout/payment-links/${paymentLinkId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Square-Version': SQUARE_API_VERSION,
      },
    });
  } catch {
    // best-effort
  }
}
