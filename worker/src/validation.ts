import type { BookingInquiry } from './types.ts';

const MAX_PAYLOAD_FIELDS = 7;
const MAX_FIELD_LENGTH = 5000;

export function parseBookingInquiry(body: unknown): BookingInquiry {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid request body');
  }

  const obj = body as Record<string, unknown>;

  const allowedKeys = new Set(['name', 'email', 'phone', 'date', 'eventType', 'location', 'message']);
  const keys = Object.keys(obj);
  if (keys.length > MAX_PAYLOAD_FIELDS) {
    throw new Error('Too many fields');
  }
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }

  const name = requireString(obj, 'name');
  const email = requireString(obj, 'email');
  if (!email.includes('@')) {
    throw new Error('email is invalid');
  }
  const date = requireString(obj, 'date');
  const location = requireString(obj, 'location');

  const phone = optionalString(obj, 'phone');
  const eventType = optionalString(obj, 'eventType');
  const message = optionalString(obj, 'message');

  return { name, email, date, location, phone, eventType, message };
}

function requireString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}

function optionalString(obj: Record<string, unknown>, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}
