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
 *
 * On payment-link orders the buyer's custom-field answer does NOT come back
 * under `checkout_options` — Square stores it as a DIGITAL fulfillment whose
 * `delivery_details.note` reads `"<field title>: <buyer's answer>"`
 * (verified against production order 7antz7Q7e2Ujx… on 2026-07-15).
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
        pickup_details?: SquareFulfillmentDetails;
        shipment_details?: SquareFulfillmentDetails;
        delivery_details?: SquareFulfillmentDetails;
      }>;
    };
  };
  const order = json.order;
  if (!order) return null;

  const note =
    order.tenders?.find((t) => t.note)?.note ?? order.metadata?.payment_note ?? null;

  const details =
    order.fulfillments?.flatMap((f) =>
      [f.pickup_details, f.shipment_details, f.delivery_details].filter(
        (d): d is SquareFulfillmentDetails => Boolean(d),
      ),
    ) ?? [];
  const recipient = details.map((d) => d.recipient).find(Boolean) ?? null;
  const fulfillmentNote = details.map((d) => d.note).find((n) => n && n.trim()) ?? null;

  return {
    note,
    customFieldName: extractCustomFieldAnswer(fulfillmentNote),
    recipientName: recipient?.display_name ?? null,
    email: recipient?.email_address ?? null,
    phone: recipient?.phone_number ?? null,
  };
}

interface SquareFulfillmentDetails {
  recipient?: SquareRecipient;
  note?: string;
}

interface SquareRecipient {
  display_name?: string;
  email_address?: string;
  phone_number?: string;
}

/** Title passed to createPaymentLink; Square prefixes the buyer's answer with it. */
const CUSTOM_FIELD_TITLE = 'Full name (for the guest list)';

/**
 * Pull the buyer's answer out of the fulfillment note, which Square writes as
 * `"<field title>: <answer>"`. Strips our known title first; otherwise falls
 * back to whatever follows the first ": " (a renamed title), then to the raw
 * note. Returns null when there is nothing usable.
 */
function extractCustomFieldAnswer(note: string | null): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith(`${CUSTOM_FIELD_TITLE.toLowerCase()}:`)) {
    const answer = trimmed.slice(CUSTOM_FIELD_TITLE.length + 1).trim();
    return answer || null;
  }
  const sep = trimmed.indexOf(': ');
  if (sep !== -1) {
    const answer = trimmed.slice(sep + 2).trim();
    return answer || null;
  }
  return trimmed;
}

export interface SquarePaymentDetails {
  /** payment note (same correlation string as the order tender note). */
  note: string | null;
  buyerEmail: string | null;
  /** Cardholder name from the billing/shipping address, if Square captured one. */
  buyerName: string | null;
  customerId: string | null;
}

/**
 * Fetch a payment. Quick-pay orders carry no recipient, but the Payment object
 * has `buyer_email_address`, a billing/shipping name, and a `customer_id`
 * pointing at the instant profile that holds the buyer's phone number.
 */
export async function getPaymentDetails(
  env: Env,
  paymentId: string,
): Promise<SquarePaymentDetails | null> {
  const { token } = requireSecrets(env);
  const res = await fetch(`${apiBase(env)}/v2/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_API_VERSION,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    payment?: {
      note?: string;
      buyer_email_address?: string;
      billing_address?: SquareAddressName;
      shipping_address?: SquareAddressName;
      customer_id?: string;
    };
  };
  const payment = json.payment;
  if (!payment) return null;

  const addr = pickNamedAddress(payment.billing_address) ?? pickNamedAddress(payment.shipping_address);
  return {
    note: payment.note ?? null,
    buyerEmail: payment.buyer_email_address ?? null,
    buyerName: addr,
    customerId: payment.customer_id ?? null,
  };
}

interface SquareAddressName {
  first_name?: string;
  last_name?: string;
}

function pickNamedAddress(addr: SquareAddressName | undefined): string | null {
  if (!addr) return null;
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

export interface SquareCustomerContact {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** Fetch the customer (instant profile) a payment points at — the only place Square exposes the buyer's phone. */
export async function getCustomerContact(
  env: Env,
  customerId: string,
): Promise<SquareCustomerContact | null> {
  const { token } = requireSecrets(env);
  const res = await fetch(`${apiBase(env)}/v2/customers/${customerId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': SQUARE_API_VERSION,
    },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    customer?: {
      given_name?: string;
      family_name?: string;
      email_address?: string;
      phone_number?: string;
    };
  };
  const customer = json.customer;
  if (!customer) return null;

  const name = [customer.given_name, customer.family_name].filter(Boolean).join(' ').trim();
  return {
    name: name || null,
    email: customer.email_address ?? null,
    phone: customer.phone_number ?? null,
  };
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
