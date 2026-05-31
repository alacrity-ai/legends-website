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
  LEGACY_CALENDAR_ENABLED: string;
}

/* ── Custom events (v0.2 admin Event Form) ─────────────────── */

export interface TicketConfig {
  ticketType: string;
  priceCents: number;
}

export interface EventTicket extends TicketConfig {
  checkoutUrl: string;
  squarePaymentLinkId: string;
  squareOrderId: string;
}

export interface EventDraft {
  showName: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startTime: string; // ISO 8601 with offset
  endTime: string; // ISO 8601 with offset
  tickets: TicketConfig[];
}

export interface EventRecord extends EventDraft {
  id: string;
  imageKey: string; // R2 object key
  tickets: EventTicket[];
  createdAt: string;
  source: 'form' | 'google-calendar';
}

/** Public shape returned by GET /api/events (extends the legacy CalendarEvent). */
export interface PublicEvent extends CalendarEvent {
  id?: string;
  endTime?: string | null;
  imageUrl?: string | null;
  tickets?: Array<{ ticketType: string; priceCents: number; checkoutUrl: string }>;
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
