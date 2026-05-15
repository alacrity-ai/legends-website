import type { CheckinRecord, Env, Party } from './types.ts';
import {
  parseBookingInquiry,
  parseCheckinPayload,
  parseMailingListSignup,
  parseShowId,
} from './validation.ts';
import { sendEmail } from './services/mailgun.ts';
import { buildNotificationEmail } from './templates/notification.ts';
import { buildConfirmationEmail } from './templates/confirmation.ts';
import { fetchUpcomingEvents } from './services/google-calendar.ts';

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

    return jsonResponse(404, { error: 'Not found' }, corsHeaders);
  },
} satisfies ExportedHandler<Env>;

async function handleEvents(
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  try {
    const events = await fetchUpcomingEvents(env.GOOGLE_API_KEY, env.GOOGLE_CALENDAR_ID);
    return jsonResponse(200, { events }, corsHeaders, {
      'Cache-Control': 'public, max-age=60',
    });
  } catch (err) {
    console.error('Failed to fetch events:', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'Failed to fetch events' }, corsHeaders);
  }
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
  if (!isAuthorized(request, env.GUESTLIST_PASSCODE)) {
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
