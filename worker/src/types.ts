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
}
