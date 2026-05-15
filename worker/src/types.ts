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
  GUESTLIST_PASSCODE: string;
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
