var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/validation.ts
var MAX_PAYLOAD_FIELDS = 8;
var MAX_FIELD_LENGTH = 5e3;
function parseBookingInquiry(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const obj = body;
  const allowedKeys = /* @__PURE__ */ new Set(["name", "email", "phone", "date", "time", "eventType", "location", "message"]);
  const keys = Object.keys(obj);
  if (keys.length > MAX_PAYLOAD_FIELDS) {
    throw new Error("Too many fields");
  }
  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }
  const name = requireString(obj, "name");
  const email = requireString(obj, "email");
  if (!email.includes("@")) {
    throw new Error("email is invalid");
  }
  const date = requireString(obj, "date");
  const location = requireString(obj, "location");
  const phone = optionalString(obj, "phone");
  const time = optionalString(obj, "time");
  const eventType = optionalString(obj, "eventType");
  const message = optionalString(obj, "message");
  return { name, email, date, location, phone, time, eventType, message };
}
__name(parseBookingInquiry, "parseBookingInquiry");
function parseMailingListSignup(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const obj = body;
  const allowedKeys = /* @__PURE__ */ new Set(["email", "name"]);
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unexpected field: ${key}`);
    }
  }
  const email = requireString(obj, "email");
  if (!email.includes("@")) {
    throw new Error("email is invalid");
  }
  const name = optionalString(obj, "name");
  return { email, name };
}
__name(parseMailingListSignup, "parseMailingListSignup");
function parseShowId(raw) {
  if (!raw) {
    throw new Error("showId is required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("showId must be YYYY-MM-DD");
  }
  return raw;
}
__name(parseShowId, "parseShowId");
function parseCheckinPayload(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new Error("Invalid request body");
  }
  const obj = body;
  for (const key of Object.keys(obj)) {
    if (key !== "partyId") {
      throw new Error(`Unexpected field: ${key}`);
    }
  }
  const partyId = requireString(obj, "partyId");
  if (!/^[a-z0-9]{6,32}$/.test(partyId)) {
    throw new Error("partyId is invalid");
  }
  return { partyId };
}
__name(parseCheckinPayload, "parseCheckinPayload");
function requireString(obj, field) {
  const value = obj[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}
__name(requireString, "requireString");
function optionalString(obj, field) {
  const value = obj[field];
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }
  if (value.length > MAX_FIELD_LENGTH) {
    throw new Error(`${field} is too long`);
  }
  return value.trim();
}
__name(optionalString, "optionalString");

// src/services/mailgun.ts
async function sendEmail(message, apiKey, domain) {
  const form = new FormData();
  form.append("from", message.from);
  form.append("to", message.to);
  form.append("subject", message.subject);
  form.append("text", message.text);
  form.append("html", message.html);
  if (message.replyTo) {
    form.append("h:Reply-To", message.replyTo);
  }
  const url = `https://api.mailgun.net/v3/${domain}/messages`;
  const auth = btoa(`api:${apiKey}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}` },
      body: form
    });
    if (res.ok) {
      return { success: true };
    }
    const body = await res.json().catch(() => ({ message: "Unknown error" }));
    return { success: false, error: body.message ?? `Mailgun returned ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { success: false, error: msg };
  }
}
__name(sendEmail, "sendEmail");

// src/templates/notification.ts
function buildNotificationEmail(inquiry) {
  const subject = `New Booking Inquiry \u2014 ${inquiry.name} \u2014 ${inquiry.date}`;
  const fields = [
    ["Name", inquiry.name],
    ["Email", inquiry.email],
    ["Phone", inquiry.phone],
    ["Event Date", inquiry.date],
    ["Event Time", inquiry.time],
    ["Event Type", inquiry.eventType],
    ["Location / Venue", inquiry.location],
    ["Message", inquiry.message]
  ];
  const presentFields = fields.filter(([, value]) => value);
  const text = presentFields.map(([label, value]) => `${label}: ${value}`).join("\n");
  const rows = presentFields.map(
    ([label, value]) => `<tr>
          <td style="padding:8px 12px;font-weight:600;vertical-align:top;color:#bfb5a3;white-space:nowrap;">${label}</td>
          <td style="padding:8px 12px;color:#f5f0e6;">${escapeHtml(value)}</td>
        </tr>`
  ).join("\n");
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#0b0a0f;color:#f5f0e6;font-family:sans-serif;">
  <h2 style="color:#d4af37;margin:0 0 16px;">New Booking Inquiry</h2>
  <table style="border-collapse:collapse;width:100%;max-width:600px;">
    ${rows}
  </table>
</body>
</html>`;
  return { subject, text, html };
}
__name(buildNotificationEmail, "buildNotificationEmail");
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeHtml, "escapeHtml");

// src/templates/confirmation.ts
function buildConfirmationEmail(inquiry) {
  const subject = "We got your inquiry \u2014 DJKMD Legends";
  const fields = [
    ["Name", inquiry.name],
    ["Email", inquiry.email],
    ["Phone", inquiry.phone],
    ["Event Date", inquiry.date],
    ["Event Time", inquiry.time],
    ["Event Type", inquiry.eventType],
    ["Location / Venue", inquiry.location],
    ["Message", inquiry.message]
  ];
  const presentFields = fields.filter(([, value]) => value);
  const fieldSummary = presentFields.map(([label, value]) => `  ${label}: ${value}`).join("\n");
  const text = `Hi ${inquiry.name},

Thanks for reaching out to DJKMD Legends! We've received your booking inquiry and will get back to you within 24 hours.

Here's a summary of what you submitted:

${fieldSummary}

If you need to reach us sooner, email us directly at booking@djkmdlegends.com.

\u2014 The DJKMD Legends Team`;
  const rows = presentFields.map(
    ([label, value]) => `<tr>
          <td style="padding:6px 12px 6px 0;font-weight:600;vertical-align:top;color:#bfb5a3;white-space:nowrap;">${label}</td>
          <td style="padding:6px 0;color:#f5f0e6;">${escapeHtml2(value)}</td>
        </tr>`
  ).join("\n");
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0b0a0f;font-family:sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <h1 style="color:#d4af37;font-size:24px;margin:0 0 8px;">DJKMD Legends</h1>
    <p style="color:#f5f0e6;font-size:16px;line-height:1.6;margin:0 0 24px;">
      Hi ${escapeHtml2(inquiry.name)},<br><br>
      Thanks for reaching out! We've received your booking inquiry and will get back to you within 24 hours.
    </p>

    <h2 style="color:#d4af37;font-size:16px;margin:0 0 12px;">Your Inquiry</h2>
    <table style="border-collapse:collapse;width:100%;">
      ${rows}
    </table>

    <hr style="border:none;border-top:1px solid #2a2530;margin:24px 0;">
    <p style="color:#bfb5a3;font-size:14px;line-height:1.5;margin:0;">
      Need to reach us sooner? Email us at
      <a href="mailto:booking@djkmdlegends.com" style="color:#d4af37;">booking@djkmdlegends.com</a>
    </p>
  </div>
</body>
</html>`;
  return { subject, text, html };
}
__name(buildConfirmationEmail, "buildConfirmationEmail");
function escapeHtml2(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escapeHtml2, "escapeHtml");

// src/services/google-calendar.ts
async function fetchUpcomingEvents(apiKey, calendarId, maxResults = 10) {
  const params = new URLSearchParams({
    key: apiKey,
    timeMin: (/* @__PURE__ */ new Date()).toISOString(),
    maxResults: String(maxResults),
    orderBy: "startTime",
    singleEvents: "true",
    eventTypes: "default",
    fields: "items(summary,description,start,location,status)"
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(body.error?.message ?? `Google Calendar API returned ${res.status}`);
  }
  const data = await res.json();
  const items = data.items ?? [];
  return items.filter((item) => item.status !== "cancelled").map((item) => {
    const dateTime = item.start?.dateTime;
    const allDayDate = item.start?.date;
    let date;
    let time;
    if (dateTime) {
      date = dateTime.slice(0, 10);
      time = dateTime.slice(11, 16);
    } else {
      date = allDayDate ?? "";
      time = null;
    }
    return {
      title: item.summary ?? "Untitled Event",
      date,
      time,
      location: item.location ?? null,
      description: item.description ?? null
    };
  });
}
__name(fetchUpcomingEvents, "fetchUpcomingEvents");

// src/index.ts
var src_default = {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }
    const url = new URL(request.url);
    if (url.pathname === "/api/events") {
      if (request.method !== "GET") {
        return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
      }
      return handleEvents(env, corsHeaders);
    }
    if (url.pathname === "/api/booking") {
      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
      }
      return handleBooking(request, env, corsHeaders);
    }
    if (url.pathname === "/api/mailing-list") {
      if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
      }
      return handleMailingList(request, env, corsHeaders);
    }
    if (url.pathname.startsWith("/api/guestlist")) {
      return handleGuestlist(request, url, env, corsHeaders);
    }
    return jsonResponse(404, { error: "Not found" }, corsHeaders);
  }
};
async function handleEvents(env, corsHeaders) {
  try {
    const events = await fetchUpcomingEvents(env.GOOGLE_API_KEY, env.GOOGLE_CALENDAR_ID);
    return jsonResponse(200, { events }, corsHeaders, {
      "Cache-Control": "public, max-age=60"
    });
  } catch (err) {
    console.error("Failed to fetch events:", err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: "Failed to fetch events" }, corsHeaders);
  }
}
__name(handleEvents, "handleEvents");
async function handleBooking(request, env, corsHeaders) {
  let inquiry;
  try {
    const body = await request.json();
    inquiry = parseBookingInquiry(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse(400, { error: message }, corsHeaders);
  }
  const notification = buildNotificationEmail(inquiry);
  const notificationResult = await sendEmail(
    {
      from: `DJKMD Legends <noreply@${env.MAILGUN_DOMAIN}>`,
      to: env.BOOKING_EMAIL,
      subject: notification.subject,
      text: notification.text,
      html: notification.html
    },
    env.MAILGUN_API_KEY,
    env.MAILGUN_DOMAIN
  );
  if (!notificationResult.success) {
    console.error("Notification email failed:", notificationResult.error);
    return jsonResponse(500, { error: "Failed to send email" }, corsHeaders);
  }
  const confirmation = buildConfirmationEmail(inquiry);
  const confirmationResult = await sendEmail(
    {
      from: `DJKMD Legends <booking@${env.MAILGUN_DOMAIN}>`,
      to: inquiry.email,
      replyTo: env.BOOKING_EMAIL,
      subject: confirmation.subject,
      text: confirmation.text,
      html: confirmation.html
    },
    env.MAILGUN_API_KEY,
    env.MAILGUN_DOMAIN
  );
  if (!confirmationResult.success) {
    console.error("Confirmation email failed:", confirmationResult.error);
    return jsonResponse(500, { error: "Failed to send email" }, corsHeaders);
  }
  return jsonResponse(200, { success: true }, corsHeaders);
}
__name(handleBooking, "handleBooking");
async function handleMailingList(request, env, corsHeaders) {
  let signup;
  try {
    const body = await request.json();
    signup = parseMailingListSignup(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse(400, { error: message }, corsHeaders);
  }
  try {
    await env.MAILING_LIST.put(
      signup.email.toLowerCase(),
      JSON.stringify({ name: signup.name ?? null, signedUpAt: (/* @__PURE__ */ new Date()).toISOString() })
    );
  } catch (err) {
    console.error("Failed to save signup:", err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: "Failed to save signup" }, corsHeaders);
  }
  return jsonResponse(200, { success: true }, corsHeaders);
}
__name(handleMailingList, "handleMailingList");
async function handleGuestlist(request, url, env, corsHeaders) {
  if (!isAuthorized(request, env.GUESTLIST_PASSCODE)) {
    return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
  }
  const noStore = { "Cache-Control": "no-store" };
  if (url.pathname === "/api/guestlist/shows") {
    if (request.method !== "GET") {
      return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
    }
    const list = await env.GUESTLIST.list({ prefix: "roster:" });
    const shows = list.keys.map((k) => k.name.slice("roster:".length)).sort();
    return jsonResponse(200, { shows }, corsHeaders, noStore);
  }
  const showMatch = url.pathname.match(/^\/api\/guestlist\/shows\/([^/]+)(?:\/(checkin))?$/);
  if (!showMatch) {
    return jsonResponse(404, { error: "Not found" }, corsHeaders);
  }
  let showId;
  try {
    showId = parseShowId(showMatch[1]);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }
  const subroute = showMatch[2];
  if (!subroute) {
    if (request.method !== "GET") {
      return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
    }
    return handleGetShow(showId, env, corsHeaders, noStore);
  }
  if (subroute === "checkin") {
    if (request.method === "POST") {
      return handleCheckin(request, showId, env, corsHeaders);
    }
    if (request.method === "DELETE") {
      return handleUncheck(request, showId, env, corsHeaders);
    }
    return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
  }
  return jsonResponse(404, { error: "Not found" }, corsHeaders);
}
__name(handleGuestlist, "handleGuestlist");
async function handleGetShow(showId, env, corsHeaders, extraHeaders) {
  const [rosterRaw, checkinList] = await Promise.all([
    env.GUESTLIST.get(`roster:${showId}`),
    env.GUESTLIST.list({ prefix: `checkin:${showId}:` })
  ]);
  if (!rosterRaw) {
    return jsonResponse(404, { error: "Show not found" }, corsHeaders);
  }
  let parties;
  try {
    parties = JSON.parse(rosterRaw);
  } catch {
    return jsonResponse(500, { error: "Roster is malformed" }, corsHeaders);
  }
  const prefix = `checkin:${showId}:`;
  const checkedInIds = checkinList.keys.map((k) => k.name.slice(prefix.length));
  const checkinValues = await Promise.all(
    checkedInIds.map((id) => env.GUESTLIST.get(`${prefix}${id}`))
  );
  const checkedIn = {};
  for (let i = 0; i < checkedInIds.length; i++) {
    const raw = checkinValues[i];
    if (!raw) continue;
    try {
      const rec = JSON.parse(raw);
      checkedIn[checkedInIds[i]] = rec.checkedInAt;
    } catch {
    }
  }
  return jsonResponse(200, { parties, checkedIn }, corsHeaders, extraHeaders);
}
__name(handleGetShow, "handleGetShow");
async function handleCheckin(request, showId, env, corsHeaders) {
  let payload;
  try {
    const body = await request.json();
    payload = parseCheckinPayload(body);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }
  const rosterRaw = await env.GUESTLIST.get(`roster:${showId}`);
  if (!rosterRaw) {
    return jsonResponse(404, { error: "Show not found" }, corsHeaders);
  }
  let parties;
  try {
    parties = JSON.parse(rosterRaw);
  } catch {
    return jsonResponse(500, { error: "Roster is malformed" }, corsHeaders);
  }
  if (!parties.some((p) => p.id === payload.partyId)) {
    return jsonResponse(404, { error: "Party not found in show" }, corsHeaders);
  }
  const record = { checkedInAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.GUESTLIST.put(`checkin:${showId}:${payload.partyId}`, JSON.stringify(record));
  return jsonResponse(200, { ok: true, checkedInAt: record.checkedInAt }, corsHeaders);
}
__name(handleCheckin, "handleCheckin");
async function handleUncheck(request, showId, env, corsHeaders) {
  let payload;
  try {
    const body = await request.json();
    payload = parseCheckinPayload(body);
  } catch (err) {
    return jsonResponse(400, { error: errorMessage(err) }, corsHeaders);
  }
  await env.GUESTLIST.delete(`checkin:${showId}:${payload.partyId}`);
  return jsonResponse(200, { ok: true }, corsHeaders);
}
__name(handleUncheck, "handleUncheck");
function isAuthorized(request, passcode) {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return false;
  }
  const token = header.slice("Bearer ".length);
  return constantTimeEqual(token, passcode);
}
__name(isAuthorized, "isAuthorized");
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
__name(constantTimeEqual, "constantTimeEqual");
function errorMessage(err) {
  return err instanceof Error ? err.message : "Invalid request";
}
__name(errorMessage, "errorMessage");
function getCorsHeaders(request, allowedOrigins) {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = allowedOrigins.split(",").map((o) => o.trim());
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
__name(getCorsHeaders, "getCorsHeaders");
function jsonResponse(status, body, ...headerObjects) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...Object.assign({}, ...headerObjects)
    }
  });
}
__name(jsonResponse, "jsonResponse");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ggXrlq/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ggXrlq/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
