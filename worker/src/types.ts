export interface BookingInquiry {
  name: string;
  email: string;
  phone?: string;
  date: string;
  time?: string;
  eventType?: string;
  location: string;
  message?: string;
}

export interface CalendarEvent {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  description: string | null;
}

export interface Env {
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  BOOKING_EMAIL: string;
  ALLOWED_ORIGINS: string;
  GOOGLE_API_KEY: string;
  GOOGLE_CALENDAR_ID: string;
  MAILING_LIST: KVNamespace;
  GUESTLIST: KVNamespace;
  EVENTS: KVNamespace;
  EVENT_IMAGES: R2Bucket;
  // ADMIN_PASSCODE is the canonical gate for the whole /admin area.
  // GUESTLIST_PASSCODE is kept as a legacy alias for one release.
  ADMIN_PASSCODE: string;
  GUESTLIST_PASSCODE?: string;
  SQUARE_ACCESS_TOKEN: string;
  SQUARE_LOCATION_ID: string;
  SQUARE_ENVIRONMENT: 'sandbox' | 'production';
  SQUARE_WEBHOOK_SIGNATURE_KEY?: string;
  /** HMAC secret for mailing-list unsubscribe tokens (agentsecrets: legends_unsubscribe_secret). */
  UNSUBSCRIBE_SECRET?: string;
  LEGACY_CALENDAR_ENABLED: string;
}

/* ── Custom events (v0.2 admin Event Form) ─────────────────── */

export interface TicketConfig {
  ticketType: string;
  priceCents: number;
}

/**
 * A stored ticket. Going forward (Option E) a ticket is just a price config;
 * checkout links are minted on demand. The Square link fields are legacy —
 * the 2 v0.2 shows minted a link per ticket up front, so they're kept
 * optional for back-compat reads only.
 */
export interface EventTicket extends TicketConfig {
  checkoutUrl?: string;
  squarePaymentLinkId?: string;
  squareOrderId?: string;
}

export interface EventDraft {
  showName: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startTime: string; // ISO 8601 with offset
  endTime: string; // ISO 8601 with offset
  tickets: TicketConfig[];
  capacity: number | null; // null = uncapped
}

export interface EventRecord extends EventDraft {
  id: string;
  imageKey: string | null; // R2 object key, or null when the event has no image
  tickets: EventTicket[];
  sold: number; // tickets sold so far (driven by the Square webhook)
  soldOut: boolean; // capacity reached, or manually toggled
  createdAt: string;
  source: 'form' | 'google-calendar';
}

/** Cached on-demand checkout link, keyed `link:<eventId>:<ticketType>:<qty>`. */
export interface CachedLink {
  checkoutUrl: string;
  squarePaymentLinkId: string;
  squareOrderId: string;
}

/** Public shape returned by GET /api/events (extends the legacy CalendarEvent). */
export interface PublicEvent extends CalendarEvent {
  id?: string;
  endTime?: string | null;
  imageUrl?: string | null;
  soldOut?: boolean;
  tickets?: Array<{ ticketType: string; priceCents: number; checkoutUrl?: string }>;
}

export type TicketVariation = 'Show and Meal' | 'Show Only' | 'Unknown';

export interface Purchase {
  variation: TicketVariation;
  quantity: number;
}

export interface Party {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  quantity: number;
  purchases: Purchase[];
  orderDate: string;
  notes: string | null;
}

export interface CheckinRecord {
  checkedInAt: string;
}

/**
 * Auto-roster entry built by the Square webhook, stored at
 * `party:<eventId>:<paymentId>` in the GUESTLIST namespace. The check-in app
 * maps these into the `Party` shape it already renders.
 */
export interface PartyRecord {
  paymentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  quantity: number;
  ticketType: string;
  purchasedAt: string;
  /** Total charged at checkout in cents (from the Square payment); absent on records written before LGD-10. */
  amountCents?: number;
}
