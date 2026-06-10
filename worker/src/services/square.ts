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
  /** Buyer-visible line item name. */
  itemName: string;
  /** Total charge in cents (already multiplied by quantity for Option E). */
  amountCents: number;
  redirectUrl: string;
  /** Correlation note read back by the webhook, e.g. `legends-event:<id>:<type>:<qty>`. */
  paymentNote: string;
  /** When set, Square collects this as a free-text field on the checkout page. */
  customFieldTitle?: string;
}

export interface CreatePaymentLinkResult {
  checkoutUrl: string;
  paymentLinkId: string;
  orderId: string;
}

/**
 * Create one Square hosted-checkout payment link via the quick_pay flow
 * (single price). Under Option E the price is already `unit × quantity`, so the
 * buyer never needs Square's (absent) quantity selector.
 */
export async function createPaymentLink(
  env: Env,
  input: CreatePaymentLinkInput,
): Promise<CreatePaymentLinkResult> {
  const { token, locationId } = requireSecrets(env);

  const body: Record<string, unknown> = {
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
      ...(input.customFieldTitle
        ? { custom_fields: [{ title: input.customFieldTitle }] }
        : {}),
    },
    payment_note: input.paymentNote,
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
 * earlier in a request that ultimately failed, on event deletion, and when a
 * show sells out. Never throws — callers treat cleanup as best-effort.
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

/* ── Webhook support ──────────────────────────────────────────── */

export interface SquareOrderDetails {
  /** payment_note carried through from the checkout link. */
  note: string | null;
  /** Buyer name from the checkout custom field, if present. */
  customFieldName: string | null;
  /** Fulfillment recipient (fallback identity). */
  recipientName: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Fetch an order and extract everything we need to build a roster entry: the
 * correlation note, the buyer's typed name (checkout custom field), and the
 * fulfillment recipient as a fallback. Returns null on a failed fetch.
 */
export async function getOrderDetails(
  env: Env,
  orderId: string,
): Promise<SquareOrderDetails | null> {
  const { token } = requireSecrets(env);
  const res = await fetch(`${apiBase(env)}/v2/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_API_VERSION,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    order?: {
      tenders?: Array<{ note?: string }>;
      metadata?: Record<string, string>;
      fulfillments?: Array<{
        pickup_details?: { recipient?: SquareRecipient };
        shipment_details?: { recipient?: SquareRecipient };
        delivery_details?: { recipient?: SquareRecipient };
      }>;
      checkout_options?: { custom_fields?: Array<{ title?: string }> };
    };
  };
  const order = json.order;
  if (!order) return null;

  const note =
    order.tenders?.find((t) => t.note)?.note ?? order.metadata?.payment_note ?? null;

  const recipient =
    order.fulfillments?.map(
      (f) =>
        f.pickup_details?.recipient ??
        f.shipment_details?.recipient ??
        f.delivery_details?.recipient,
    ).find(Boolean) ?? null;

  return {
    note,
    customFieldName: extractCustomFieldName(order.checkout_options?.custom_fields),
    recipientName: recipient?.display_name ?? null,
    email: recipient?.email_address ?? null,
    phone: recipient?.phone_number ?? null,
  };
}

interface SquareRecipient {
  display_name?: string;
  email_address?: string;
  phone_number?: string;
}

/**
 * The attendee name is collected via a checkout custom field. Square's order
 * representation of custom-field *values* has shifted across API versions, so
 * read defensively from the shapes seen in practice (a `text`/`value` on the
 * field object). Returns null if no readable value is present — the webhook
 * then falls back to the fulfillment recipient.
 */
function extractCustomFieldName(
  fields: Array<{ title?: string }> | undefined,
): string | null {
  if (!fields || fields.length === 0) return null;
  for (const f of fields) {
    const v = f as { text?: unknown; value?: unknown };
    const candidate = typeof v.text === 'string' ? v.text : typeof v.value === 'string' ? v.value : null;
    if (candidate && candidate.trim()) return candidate.trim();
  }
  return null;
}

/**
 * Verify a Square webhook signature. Square computes HMAC-SHA256 over
 * `notificationUrl + rawBody` keyed with the subscription's signature key and
 * sends it as `x-square-hmacsha256-signature` (base64).
 */
export async function verifyWebhookSignature(
  signatureKey: string,
  notificationUrl: string,
  rawBody: string,
  providedSignature: string,
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signatureKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(notificationUrl + rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, providedSignature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
