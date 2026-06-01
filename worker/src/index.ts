import type {
  CheckinRecord,
  Env,
  EventDraft,
  EventRecord,
  EventTicket,
  Party,
  PublicEvent,
} from './types.ts';
import {
  parseBookingInquiry,
  parseCheckinPayload,
  parseEventDraft,
  parseEventPatch,
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
    imageUrl: r.imageKey ? `/api/events/${r.id}/image` : null,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format an event start time for the buyer-visible Square line item, e.g.
 * "Aug 15, 2026, 8:00 PM". Reads the authored wall-clock parts straight from
 * the ISO string (which carries the ET offset) so the worker's UTC runtime
 * doesn't shift the displayed time.
 */
function formatEventDateTime(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const [, year, month, day, hh, mm] = m;
  const monthName = MONTHS[Number(month) - 1] ?? month;
  let hour = Number(hh);
  const period = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${monthName} ${Number(day)}, ${year}, ${hour}:${mm} ${period}`;
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
  if (idMatch) {
    if (request.method === 'GET') {
      return handleGetEvent(idMatch[1], env, corsHeaders, noStore);
    }
    if (request.method === 'DELETE') {
      return handleDeleteEvent(idMatch[1], env, corsHeaders, noStore);
    }
    if (request.method === 'PATCH') {
      return handlePatchEvent(idMatch[1], request, env, corsHeaders, noStore);
    }
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }

  return jsonResponse(404, { error: 'Not found' }, corsHeaders);
}

interface ParsedCreate {
  draft: EventDraft;
  imageBytes: ArrayBuffer | ArrayBufferView;
  imageMime: string;
  imageExt: string;
}

/**
 * Create an event. Accepts the admin form's multipart/form-data body OR a
 * programmatic application/json body with the same field contract (and the
 * image as base64 / a data URL). Both feed the same creation pipeline.
 */
async function handleCreateEvent(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  noStore: Record<string, string>,
): Promise<Response> {
  const contentType = request.headers.get('Content-Type') ?? '';
  let parsed: ParsedCreate;
  try {
    parsed = contentType.includes('application/json')
      ? await parseJsonCreate(request)
      : await parseMultipartCreate(request);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }
  return finalizeEventCreation(parsed, env, corsHeaders, noStore);
}

/** Parse the admin form body: `payload` (JSON string) + `image` file. */
async function parseMultipartCreate(request: Request): Promise<ParsedCreate> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new Error('Expected multipart/form-data');
  }

  const payloadRaw = form.get('payload');
  if (typeof payloadRaw !== 'string') throw new Error('payload is required');
  const draft = parseEventDraft(JSON.parse(payloadRaw));

  // FormData.get returns an uploaded file we duck-type (worker FormDataEntryValue omits File).
  const imageEntry: unknown = form.get('image');
  if (!isUploadedFile(imageEntry)) throw new Error('image is required');
  const imageExt = ALLOWED_IMAGE_TYPES[imageEntry.type];
  if (!imageExt) throw new Error('image must be JPEG, PNG, or WebP');
  if (imageEntry.size > MAX_IMAGE_BYTES) throw new Error('image must be 5 MB or smaller');

  return {
    draft,
    imageBytes: await imageEntry.arrayBuffer(),
    imageMime: imageEntry.type,
    imageExt,
  };
}

/**
 * Parse a programmatic JSON body. The draft fields match the form exactly; the
 * image is supplied as a base64 string or a data URL:
 *   { ...eventFields, "image": "data:image/jpeg;base64,..." }
 *   { ...eventFields, "image": "<base64>", "imageType": "image/jpeg" }
 */
async function parseJsonCreate(request: Request): Promise<ParsedCreate> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid JSON body');
  }

  // Separate the image fields; the rest must match the form's draft contract.
  const { image, imageBase64, imageType, ...rest } = body as Record<string, unknown>;
  const draft = parseEventDraft(rest);

  const imageInput =
    typeof image === 'string' ? image : typeof imageBase64 === 'string' ? imageBase64 : null;
  if (!imageInput) {
    throw new Error('image is required (a base64 string or a data URL)');
  }
  const decoded = decodeBase64Image(
    imageInput,
    typeof imageType === 'string' ? imageType : undefined,
  );
  return { draft, imageBytes: decoded.bytes, imageMime: decoded.mime, imageExt: decoded.ext };
}

function decodeBase64Image(
  input: string,
  explicitMime: string | undefined,
): { bytes: Uint8Array; mime: string; ext: string } {
  let mime = explicitMime;
  let b64 = input;
  const dataUrl = input.match(/^data:([^;,]+)(?:;base64)?,(.*)$/s);
  if (dataUrl) {
    mime = dataUrl[1];
    b64 = dataUrl[2];
  }
  if (!mime) {
    throw new Error('image type is required (use a data URL or set "imageType")');
  }
  const ext = ALLOWED_IMAGE_TYPES[mime];
  if (!ext) {
    throw new Error('image must be JPEG, PNG, or WebP');
  }

  let binary: string;
  try {
    binary = atob(b64.replace(/\s/g, ''));
  } catch {
    throw new Error('image is not valid base64');
  }
  if (binary.length === 0) throw new Error('image is empty');
  if (binary.length > MAX_IMAGE_BYTES) throw new Error('image must be 5 MB or smaller');

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime, ext };
}

/** Shared pipeline: create Square links, store the image in R2, persist the record. */
async function finalizeEventCreation(
  parsed: ParsedCreate,
  env: Env,
  corsHeaders: Record<string, string>,
  noStore: Record<string, string>,
): Promise<Response> {
  const { draft, imageBytes, imageMime, imageExt } = parsed;
  const id = crypto.randomUUID();
  const redirectUrl = primaryOrigin(env) + '/?purchase=success';

  // Create one Square payment link per ticket type. Abort (and clean up) on any failure.
  const created: EventTicket[] = [];
  for (const ticket of draft.tickets) {
    try {
      const link = await createPaymentLink(env, {
        eventId: id,
        ticketType: ticket.ticketType,
        // Buyer-visible checkout line item: ticket type · date/time · venue.
        itemName: `${ticket.ticketType} · ${formatEventDateTime(draft.startTime)} · ${draft.venueName}`,
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

  // Store the image in R2.
  const imageKey = `events/${id}.${imageExt}`;
  try {
    await env.EVENT_IMAGES.put(imageKey, imageBytes, {
      httpMetadata: { contentType: imageMime },
    });
  } catch (err) {
    await Promise.all(created.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)));
    console.error('Image upload failed:', errorMessage(err));
    return jsonResponse(500, { error: 'Failed to store image' }, corsHeaders);
  }

  // Persist the event record (commit point).
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

async function handleGetEvent(
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
    return jsonResponse(500, { error: 'Event is malformed' }, corsHeaders);
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
  if (record.imageKey) {
    await env.EVENT_IMAGES.delete(record.imageKey).catch(() => {});
  }
  await Promise.all(
    record.tickets.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)),
  );

  return jsonResponse(200, { ok: true }, corsHeaders, noStore);
}

/**
 * Update an event (JSON, partial). Any subset of the create fields can be sent.
 * - Metadata edits (name, description, venue, dates) update the record and KEEP
 *   the existing Square checkout links (so already-shared links/QRs still work).
 * - Sending `tickets` mints fresh Square links for the new set and deactivates
 *   the old ones (checkout prices can't be edited in place).
 * - Image: `image` (base64/data URL) replaces it; `image: null` or
 *   `removeImage: true` removes it; omit to leave it unchanged.
 */
async function handlePatchEvent(
  id: string,
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  noStore: Record<string, string>,
): Promise<Response> {
  const existingRaw = await env.EVENTS.get(`event:${id}`);
  if (!existingRaw) {
    return jsonResponse(404, { error: 'Event not found' }, corsHeaders);
  }
  let existing: EventRecord;
  try {
    existing = JSON.parse(existingRaw) as EventRecord;
  } catch {
    return jsonResponse(500, { error: 'Event is malformed' }, corsHeaders);
  }

  // Parse the body: metadata/ticket fields via parseEventPatch, image directives separately.
  let patch: Partial<EventDraft>;
  let imageAction: { type: 'none' } | { type: 'remove' } | { type: 'replace'; bytes: Uint8Array; mime: string; ext: string };
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('Invalid JSON body');
    }
    const { image, imageBase64, imageType, removeImage, ...rest } = body as Record<string, unknown>;
    patch = parseEventPatch(rest);

    if (removeImage === true || image === null) {
      imageAction = { type: 'remove' };
    } else if (typeof image === 'string' || typeof imageBase64 === 'string') {
      const input = typeof image === 'string' ? image : (imageBase64 as string);
      const decoded = decodeBase64Image(input, typeof imageType === 'string' ? imageType : undefined);
      imageAction = { type: 'replace', ...decoded };
    } else {
      imageAction = { type: 'none' };
    }
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }

  if (Object.keys(patch).length === 0 && imageAction.type === 'none') {
    return jsonResponse(400, { error: 'No fields to update' }, corsHeaders);
  }

  // Merge metadata and validate cross-field date ordering.
  const merged = { ...existing, ...patch };
  if (new Date(merged.endTime).getTime() <= new Date(merged.startTime).getTime()) {
    return jsonResponse(400, { error: 'endTime must be after startTime' }, corsHeaders);
  }

  // If tickets changed, mint new Square links (deactivate the old ones after commit).
  let tickets = existing.tickets;
  let oldLinkIds: string[] = [];
  if (patch.tickets) {
    const created: EventTicket[] = [];
    for (const ticket of patch.tickets) {
      try {
        const link = await createPaymentLink(env, {
          eventId: id,
          ticketType: ticket.ticketType,
          itemName: `${ticket.ticketType} · ${formatEventDateTime(merged.startTime)} · ${merged.venueName}`,
          amountCents: ticket.priceCents,
          redirectUrl: primaryOrigin(env) + '/?purchase=success',
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
    tickets = created;
    oldLinkIds = existing.tickets.map((t) => t.squarePaymentLinkId);
  }

  // Resolve the image change. New image stored before commit; old removed after.
  let imageKey = existing.imageKey;
  let oldImageKeyToDelete: string | null = null;
  let storedNewKey: string | null = null;
  if (imageAction.type === 'remove') {
    oldImageKeyToDelete = existing.imageKey;
    imageKey = null;
  } else if (imageAction.type === 'replace') {
    const newKey = `events/${id}.${imageAction.ext}`;
    try {
      await env.EVENT_IMAGES.put(newKey, imageAction.bytes, {
        httpMetadata: { contentType: imageAction.mime },
      });
      storedNewKey = newKey;
    } catch (err) {
      if (patch.tickets) {
        await Promise.all(tickets.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)));
      }
      console.error('Image upload failed:', errorMessage(err));
      return jsonResponse(500, { error: 'Failed to store image' }, corsHeaders);
    }
    if (existing.imageKey && existing.imageKey !== newKey) {
      oldImageKeyToDelete = existing.imageKey;
    }
    imageKey = newKey;
  }

  // Commit the updated record.
  const updated: EventRecord = { ...existing, ...patch, tickets, imageKey };
  try {
    await env.EVENTS.put(`event:${id}`, JSON.stringify(updated));
  } catch (err) {
    // Roll back resources created for this (failed) update.
    if (patch.tickets) {
      await Promise.all(tickets.map((t) => deactivatePaymentLink(env, t.squarePaymentLinkId)));
    }
    if (storedNewKey) await env.EVENT_IMAGES.delete(storedNewKey).catch(() => {});
    console.error('Event KV write failed:', errorMessage(err));
    return jsonResponse(500, { error: 'Failed to save event' }, corsHeaders);
  }

  // Best-effort cleanup of resources the old record referenced.
  await Promise.all(oldLinkIds.map((linkId) => deactivatePaymentLink(env, linkId)));
  if (oldImageKeyToDelete) {
    await env.EVENT_IMAGES.delete(oldImageKeyToDelete).catch(() => {});
  }

  return jsonResponse(200, { event: updated }, corsHeaders, noStore);
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

  if (!record.imageKey) {
    return jsonResponse(404, { error: 'Image not found' }, corsHeaders);
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
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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
