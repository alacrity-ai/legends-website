export interface BookingInquiry {
  name: string;
  email: string;
  phone?: string;
  date: string;
  eventType?: string;
  location: string;
  message?: string;
}

export interface Env {
  MAILGUN_API_KEY: string;
  MAILGUN_DOMAIN: string;
  BOOKING_EMAIL: string;
  ALLOWED_ORIGINS: string;
}
