import type {
  CheckinRecord,
  Env,
  EventRecord,
  EventTicket,
  Party,
  PublicEvent,
} from './types.ts';
import {
  parseBookingInquiry,
  parseCheckinPayload,
  parseEventDraft,
  parseMailingListSignup,
  parseShowId,
} from './validation.ts';
import { sendEmail } from './services/mailgun.ts';
import { buildNotificationEmail } from './templates/notification.ts';
import { buildConfirmationEmail } from './templates/confirmation.ts';
import { fetchUpcomingEvents } from './services/google-calendar.ts';
import { createPaymentLink, deactivatePaymentLink } from './services/square.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = getCorsHeaders(request, env.ALLOWED_ORIGINS);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === '/api/events') {
      if (request.method !== 'GET') {
        return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
      }
      return handleEvents(env, corsHeaders);
    }

    if (url.pathname === '/api/booking') {
      if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
      }
      return handleBooking(request, env, corsHeaders);
    }

    if (url.pathname === '/api/mailing-list') {
      if (request.method !== 'POST') {
        return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
      }
      return handleMailingList(request, env, corsHeaders);
    }

    if (url.pathname.startsWith('/api/guestlist')) {
      return handleGuestlist(request, url, env, corsHeaders);
    }

    if (url.pathname.startsWith('/api/admin/events')) {
      return handleAdminEvents(request, url, env, corsHeaders);
    }

    const imageMatch = url.pathname.match(/^\/api\/events\/([a-f0-9-]+)\/image$/);
    if (imageMatch) {
      if (request.method !== 'GET') {
        return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
      }
      return handleEventImage(imageMatch[1], env, corsHeaders);
    }

    return jsonResponse(404, { error: 'Not found' }, corsHeaders);
  },
} satisfies ExportedHandler<Env>;

async function handleEvents(
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const now = Date.now();

    // Form-created events from KV (primary source going forward).
    const records = await listEventRecords(env);
    const kvEvents: PublicEvent[] = records
      .filter((r) => new Date(r.endTime).getTime() >= now)
      .map(eventRecordToPublic);

    // Legacy Google Calendar events, kept during the grandfathering window.
    let legacyEvents: PublicEvent[] = [];
    if (env.LEGACY_CALENDAR_ENABLED === 'true') {
      try {
        legacyEvents = await fetchUpcomingEvents(env.GOOGLE_API_KEY, env.GOOGLE_CALENDAR_ID);
      } catch (err) {
        // Don't let a calendar outage break the whole feed; just log and continue.
        console.error('Legacy calendar fetch failed:', err instanceof Error ? err.message : err);
      }
    }

    const events = [...kvEvents, ...legacyEvents].sort((a, b) =>
      eventSortKey(a).localeCompare(eventSortKey(b)),
    );

    return jsonResponse(200, { events }, corsHeaders, {
      'Cache-Control': 'public, max-age=60',
    });
  } catch (err) {
    console.error('Failed to fetch events:', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'Failed to fetch events' }, corsHeaders);
  }
}

function eventSortKey(e: PublicEvent): string {
  return `${e.date}T${e.time ?? '00:00'}`;
}

async function listEventRecords(env: Env): Promise<EventRecord[]> {
  const list = await env.EVENTS.list({ prefix: 'event:' });
  const raws = await Promise.all(list.keys.map((k) => env.EVENTS.get(k.name)));
  const records: EventRecord[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as EventRecord);
    } catch {
      // skip malformed record
    }
  }
  return records;
}

function eventRecordToPublic(r: EventRecord): PublicEvent {
  // startTime/endTime are ISO 8601 with offset, e.g. "2026-07-12T20:00:00-04:00".
  return {
    id: r.id,
    title: r.showName,
    date: r.startTime.slice(0, 10),
    time: r.startTime.slice(11, 16),
    endTime: r.endTime.slice(11, 16),
    location: `${r.venueName}, ${r.venueAddress}`,
    description: r.description,
    imageUrl: `/api/events/${r.id}/image`,
    tickets: r.tickets.map((t) => ({
      ticketType: t.ticketType,
      priceCents: t.priceCents,
      checkoutUrl: t.checkoutUrl,
    })),
  };
}

async function handleBooking(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let inquiry;
  try {
    const body = await request.json();
    inquiry = parseBookingInquiry(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return jsonResponse(400, { error: message }, corsHeaders);
  }

  const notification = buildNotificationEmail(inquiry);
  const notificationResult = await sendEmail(
    {
      from: `DJKMD Legends <noreply@${env.MAILGUN_DOMAIN}>`,
      to: env.BOOKING_EMAIL,
      subject: notification.subject,
      text: notification.text,
      html: notification.html,
    },
    env.MAILGUN_API_KEY,
    env.MAILGUN_DOMAIN,
  );

  if (!notificationResult.success) {
    console.error('Notification email failed:', notificationResult.error);
    return jsonResponse(500, { error: 'Failed to send email' }, corsHeaders);
  }

  const confirmation = buildConfirmationEmail(inquiry);
  const confirmationResult = await sendEmail(
    {
      from: `DJKMD Legends <booking@${env.MAILGUN_DOMAIN}>`,
      to: inquiry.email,
      replyTo: env.BOOKING_EMAIL,
      subject: confirmation.subject,
      text: confirmation.text,
      html: confirmation.html,
    },
    env.MAILGUN_API_KEY,
    env.MAILGUN_DOMAIN,
  );

  if (!confirmationResult.success) {
    console.error('Confirmation email failed:', confirmationResult.error);
    return jsonResponse(500, { error: 'Failed to send email' }, corsHeaders);
  }

  return jsonResponse(200, { success: true }, corsHeaders);
}

async function handleMailingList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let signup;
  try {
    const body = await request.json();
    signup = parseMailingListSignup(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request';
    return jsonResponse(400, { error: message }, corsHeaders);
  }

  try {
    await env.MAILING_LIST.put(
      signup.email.toLowerCase(),
      JSON.stringify({ name: signup.name ?? null, signedUpAt: new Date().toISOString() }),
    );
  } catch (err) {
    console.error('Failed to save signup:', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'Failed to save signup' }, corsHeaders);
  }

  return jsonResponse(200, { success: true }, corsHeaders);
}

async function handleGuestlist(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!isAuthorized(request, adminPasscode(env))) {
    return jsonResponse(401, { error: 'Unauthorized' }, corsHeaders);
  }

  const noStore = { 'Cache-Control': 'no-store' };

  if (url.pathname === '/api/guestlist/shows') {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
    }
    const list = await env.GUESTLIST.list({ prefix: 'roster:' });
    const shows = list.keys.map((k) => k.name.slice('roster:'.length)).sort();
    return jsonResponse(200, { shows }, corsHeaders, noStore);
  }

  const showMatch = url.pathname.match(/^\/api\/guestlist\/shows\/([^/]+)(?:\/(checkin))?$/);
  if (!showMatch) {
    return jsonResponse(404, { error: 'Not found' }, corsHeaders);
  }

  let showId: string;
  try {
    showId = parseShowId(showMatch[1]);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }
  const subroute = showMatch[2];

  if (!subroute) {
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
    }
    return handleGetShow(showId, env, corsHeaders, noStore);
  }

  if (subroute === 'checkin') {
    if (request.method === 'POST') {
      return handleCheckin(request, showId, env, corsHeaders);
    }
    if (request.method === 'DELETE') {
      return handleUncheck(request, showId, env, corsHeaders);
    }
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }

  return jsonResponse(404, { error: 'Not found' }, corsHeaders);
}

async function handleGetShow(
  showId: string,
  env: Env,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string>,
): Promise<Response> {
  const [rosterRaw, checkinList] = await Promise.all([
    env.GUESTLIST.get(`roster:${showId}`),
    env.GUESTLIST.list({ prefix: `checkin:${showId}:` }),
  ]);

  if (!rosterRaw) {
    return jsonResponse(404, { error: 'Show not found' }, corsHeaders);
  }

  let parties: Party[];
  try {
    parties = JSON.parse(rosterRaw) as Party[];
  } catch {
    return jsonResponse(500, { error: 'Roster is malformed' }, corsHeaders);
  }

  const prefix = `checkin:${showId}:`;
  const checkedInIds = checkinList.keys.map((k) => k.name.slice(prefix.length));
  const checkinValues = await Promise.all(
    checkedInIds.map((id) => env.GUESTLIST.get(`${prefix}${id}`)),
  );

  const checkedIn: Record<string, string> = {};
  for (let i = 0; i < checkedInIds.length; i++) {
    const raw = checkinValues[i];
    if (!raw) continue;
    try {
      const rec = JSON.parse(raw) as CheckinRecord;
      checkedIn[checkedInIds[i]] = rec.checkedInAt;
    } catch {
      // skip malformed entry
    }
  }

  return jsonResponse(200, { parties, checkedIn }, corsHeaders, extraHeaders);
}

async function handleCheckin(
  request: Request,
  showId: string,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let payload: { partyId: string };
  try {
    const body = await request.json();
    payload = parseCheckinPayload(body);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }

  const rosterRaw = await env.GUESTLIST.get(`roster:${showId}`);
  if (!rosterRaw) {
    return jsonResponse(404, { error: 'Show not found' }, corsHeaders);
  }
  let parties: Party[];
  try {
    parties = JSON.parse(rosterRaw) as Party[];
  } catch {
    return jsonResponse(500, { error: 'Roster is malformed' }, corsHeaders);
  }
  if (!parties.some((p) => p.id === payload.partyId)) {
    return jsonResponse(404, { error: 'Party not found in show' }, corsHeaders);
  }

  const record: CheckinRecord = { checkedInAt: new Date().toISOString() };
  await env.GUESTLIST.put(`checkin:${showId}:${payload.partyId}`, JSON.stringify(record));

  return jsonResponse(200, { ok: true, checkedInAt: record.checkedInAt }, corsHeaders);
}

async function handleUncheck(
  request: Request,
  showId: string,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  let payload: { partyId: string };
  try {
    const body = await request.json();
    payload = parseCheckinPayload(body);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }

  await env.GUESTLIST.delete(`checkin:${showId}:${payload.partyId}`);
  return jsonResponse(200, { ok: true }, corsHeaders);
}

/* ── Admin: custom events (v0.2) ───────────────────────────── */

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

interface UploadedFile {
  arrayBuffer(): Promise<ArrayBuffer>;
  type: string;
  size: number;
}

function isUploadedFile(v: unknown): v is UploadedFile {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as UploadedFile).arrayBuffer === 'function' &&
    typeof (v as UploadedFile).type === 'string' &&
    typeof (v as UploadedFile).size === 'number'
  );
}

async function handleAdminEvents(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!isAuthorized(request, adminPasscode(env))) {
    return jsonResponse(401, { error: 'Unauthorized' }, corsHeaders);
  }

  const noStore = { 'Cache-Control': 'no-store' };

  if (url.pathname === '/api/admin/events') {
    if (request.method === 'POST') {
      return handleCreateEvent(request, env, corsHeaders, noStore);
    }
    if (request.method === 'GET') {
      const records = await listEventRecords(env);
      records.sort((a, b) => b.startTime.localeCompare(a.startTime));
      return jsonResponse(200, { events: records }, corsHeaders, noStore);
    }
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }

  const idMatch = url.pathname.match(/^\/api\/admin\/events\/([a-f0-9-]+)$/);
  if (idMatch && request.method === 'DELETE') {
    return handleDeleteEvent(idMatch[1], env, corsHeaders, noStore);
  }

  return jsonResponse(404, { error: 'Not found' }, corsHeaders);
}

async function handleCreateEvent(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  noStore: Record<string, string>,
): Promise<Response> {
  // 1. Parse multipart body (fields JSON + image file).
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse(400, { error: 'Expected multipart/form-data' }, corsHeaders);
  }

  const payloadRaw = form.get('payload');
  const imageEntry: unknown = form.get('image');

  // 2. Validate the draft fields.
  let draft;
  try {
    if (typeof payloadRaw !== 'string') throw new Error('payload is required');
    draft = parseEventDraft(JSON.parse(payloadRaw));
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }

  // 3. Validate the image. (FormData.get returns an uploaded file we duck-type, since the
  // worker FormDataEntryValue type doesn't include File.)
  if (!isUploadedFile(imageEntry)) {
    return jsonResponse(400, { error: 'image is required' }, corsHeaders);
  }
  const image = imageEntry;
  const ext = ALLOWED_IMAGE_TYPES[image.type];
  if (!ext) {
    return jsonResponse(400, { error: 'image must be JPEG, PNG, or WebP' }, corsHeaders);
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return jsonResponse(400, { error: 'image must be 5 MB or smaller' }, corsHeaders);
  }

  const id = crypto.randomUUID();
  const redirectUrl = primaryOrigin(env) + '/?purchase=success';

  // 4. Create one Square payment link per ticket type. Abort (and clean up) on any failure.
  const created: EventTicket[] = [];
  for (const ticket of draft.tickets) {
    try {
      const link = await createPaymentLink(env, {
        eventId: id,
        ticketType: ticket.ticketType,
        itemName: `${draft.showName} — ${ticket.ticketType}`,
        amountCents: ticket.priceCents,
        redirectUrl,
      });
      created.push({
        ...ticket,
        checkoutUrl: link.checkoutUrl,
        squarePaymentLinkId: link.paymentLinkId,
        squareOrderId: link.orderId,
      });
    } catch (err) {
      await Promise.all(created.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)));
      return jsonResponse(
        502,
        { error: `Square: "${ticket.ticketType}" failed: ${errorMessage(err)}` },
        corsHeaders,
      );
    }
  }

  // 5. Store the image in R2.
  const imageKey = `events/${id}.${ext}`;
  try {
    await env.EVENT_IMAGES.put(imageKey, await image.arrayBuffer(), {
      httpMetadata: { contentType: image.type },
    });
  } catch (err) {
    await Promise.all(created.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)));
    console.error('Image upload failed:', errorMessage(err));
    return jsonResponse(500, { error: 'Failed to store image' }, corsHeaders);
  }

  // 6. Persist the event record (commit point).
  const record: EventRecord = {
    id,
    ...draft,
    tickets: created,
    imageKey,
    createdAt: new Date().toISOString(),
    source: 'form',
  };
  try {
    await env.EVENTS.put(`event:${id}`, JSON.stringify(record));
  } catch (err) {
    await env.EVENT_IMAGES.delete(imageKey).catch(() => {});
    await Promise.all(created.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)));
    console.error('Event KV write failed:', errorMessage(err));
    return jsonResponse(500, { error: 'Failed to save event' }, corsHeaders);
  }

  return jsonResponse(200, { event: record }, corsHeaders, noStore);
}

async function handleDeleteEvent(
  id: string,
  env: Env,
  corsHeaders: Record<string, string>,
  noStore: Record<string, string>,
): Promise<Response> {
  const raw = await env.EVENTS.get(`event:${id}`);
  if (!raw) {
    return jsonResponse(404, { error: 'Event not found' }, corsHeaders);
  }
  let record: EventRecord;
  try {
    record = JSON.parse(raw) as EventRecord;
  } catch {
    // Malformed record — still allow deleting the key.
    await env.EVENTS.delete(`event:${id}`);
    return jsonResponse(200, { ok: true }, corsHeaders, noStore);
  }

  await env.EVENTS.delete(`event:${id}`);
  await env.EVENT_IMAGES.delete(record.imageKey).catch(() => {});
  await Promise.all(
    record.tickets.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)),
  );

  return jsonResponse(200, { ok: true }, corsHeaders, noStore);
}

async function handleEventImage(
  id: string,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const raw = await env.EVENTS.get(`event:${id}`);
  if (!raw) {
    return jsonResponse(404, { error: 'Event not found' }, corsHeaders);
  }
  let record: EventRecord;
  try {
    record = JSON.parse(raw) as EventRecord;
  } catch {
    return jsonResponse(500, { error: 'Event is malformed' }, corsHeaders);
  }

  const object = await env.EVENT_IMAGES.get(record.imageKey);
  if (!object) {
    return jsonResponse(404, { error: 'Image not found' }, corsHeaders);
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function primaryOrigin(env: Env): string {
  const first = env.ALLOWED_ORIGINS.split(',')[0]?.trim();
  return first || 'https://djkmdlegends.com';
}

function adminPasscode(env: Env): string {
  return env.ADMIN_PASSCODE || env.GUESTLIST_PASSCODE || '';
}

function isAuthorized(request: Request, passcode: string): boolean {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    return false;
  }
  const token = header.slice('Bearer '.length);
  return constantTimeEqual(token, passcode);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Invalid request';
}

function getCorsHeaders(request: Request, allowedOrigins: string): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = allowedOrigins.split(',').map((o) => o.trim());

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  ...headerObjects: Record<string, string>[]
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...Object.assign({}, ...headerObjects),
    },
  });
}
