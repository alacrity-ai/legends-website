# Booking Form — Design Document

## 1. Goal

Replace the stubbed Formspree integration with a Mailgun-powered booking inquiry flow. When a visitor submits the booking form:

1. **Notification email** is sent to `booking@djkmdlegends.com` containing the full form contents.
2. **Auto-confirmation email** is sent to the customer acknowledging receipt ("Thanks for your inquiry — we'll be in touch within 24 hours.").
3. The visitor sees an on-page success message (existing behavior).

This is a lead-capture form, not an automated booking system. Every inquiry requires manual follow-up. The form's job is to collect the inquiry and close the communication loop with the customer.

---

## 2. Architectural Constraint

Mailgun's API requires an API key (a secret). Secrets cannot be exposed in the client-side bundle (per DESIGN.md §4.2, §14). This means the form cannot POST directly to Mailgun from the browser.

**Solution:** Introduce a **Cloudflare Worker** as a thin API endpoint that:

- receives the form submission from the frontend
- validates the payload
- calls the Mailgun API with the secret key
- returns success/failure to the frontend

This is consistent with the existing Cloudflare-first infrastructure (Pages, DNS, Email Routing) and does not constitute a "custom backend" in the traditional sense — it is a single stateless function with no persistence, no auth, and no application logic beyond form relay.

---

## 3. Requirements

### Functional

| # | Requirement |
|---|---|
| F1 | Form submission sends a notification email to `booking@djkmdlegends.com` via Mailgun |
| F2 | Form submission sends an auto-confirmation email to the customer via Mailgun |
| F3 | Notification email contains all form fields: name, email, phone, event date, event type, venue/location, message |
| F4 | Confirmation email is branded, concise, and sets response-time expectations |
| F5 | Frontend shows success state on 2xx response from the worker |
| F6 | Frontend shows error state on non-2xx or network failure |
| F7 | Client-side validation for required fields (name, email, event date, venue) before submission |

### Non-Functional

| # | Requirement |
|---|---|
| NF1 | Mailgun API key is stored as a Cloudflare Worker secret — never in client code or git |
| NF2 | Worker validates payload shape and rejects malformed requests |
| NF3 | Worker enforces CORS to allow requests only from the production origin (and localhost for dev) |
| NF4 | ~~Rate limiting~~ — deferred; low-volume site, not needed for launch |
| NF5 | The Mailgun client is modular and isolated so the email provider can be swapped without touching form or worker logic |
| NF6 | Emails are sent from the verified Mailgun domain `mg.djkmdlegends.com` |

---

## 4. Proposed Design

### 4.1 System Flow

```
Browser (React form)
  │
  │  POST /api/booking  (JSON payload)
  ▼
Cloudflare Worker
  │
  ├─ validate payload
  ├─ call Mailgun: send notification email → booking@djkmdlegends.com
  ├─ call Mailgun: send confirmation email → customer
  │
  ▼
Return { success: true } or { error: "..." }
```

### 4.2 Project Structure

```
legends-website/
  src/
    services/
      booking.ts            # Frontend booking submission client
    components/
      marketing/
        BookingForm/
          BookingForm.tsx    # Form UI (already exists — update to use booking service)

  worker/
    src/
      index.ts              # Worker entry — route handler
      services/
        mailgun.ts          # Mailgun API client (isolated, swappable)
      templates/
        notification.ts     # Notification email builder (plain text + HTML)
        confirmation.ts     # Confirmation email builder (plain text + HTML)
      validation.ts         # Payload validation
      types.ts              # Shared types (BookingInquiry, etc.)
    wrangler.toml           # Worker config (routes, env bindings)
    package.json            # Worker-specific dependencies (if any)
    tsconfig.json           # Worker-specific TS config
```

**Key decisions:**

- **`src/services/booking.ts`** — A thin client that owns the fetch call to the worker. The `BookingForm` component calls this instead of hitting an endpoint directly. If the backend ever changes (different worker, different provider), only this file changes.
- **`worker/src/services/mailgun.ts`** — Isolated Mailgun client. Accepts a structured message, returns success/failure. Knows nothing about booking forms — just sends emails. Swappable for SendGrid, SES, etc.
- **`worker/src/templates/`** — Email content builders. Separate from the Mailgun transport so templates can be updated without touching the API client.
- **Worker lives in the same repo** but is its own deployable unit with its own `wrangler.toml`.

### 4.3 Environment / Secrets

| Variable | Location | Purpose |
|---|---|---|
| `MAILGUN_API_KEY` | Cloudflare Worker secret | Mailgun API authentication |
| `MAILGUN_DOMAIN` | Cloudflare Worker secret | Mailgun sending domain (`mg.djkmdlegends.com`) |
| `BOOKING_EMAIL` | Worker env var or hardcoded | Destination for notifications |
| `ALLOWED_ORIGINS` | Worker env var | CORS allowlist |
| `VITE_BOOKING_API_URL` | Frontend env var (`.env`) | Worker endpoint URL |

### 4.4 Email Specifications

**Notification email** (to `booking@djkmdlegends.com`):
- From: `noreply@mg.djkmdlegends.com`
- Subject: `New Booking Inquiry — {name} — {event date}`
- Body: all form fields, clearly labeled, plain text + simple HTML

**Confirmation email** (to customer):
- From: `booking@mg.djkmdlegends.com` (or `noreply@`)
- Reply-To: `booking@djkmdlegends.com`
- Subject: `We got your inquiry — DJKMD Legends`
- Body: branded acknowledgment, summary of submitted inquiry, expected response time, contact info fallback

### 4.5 Frontend Changes

The existing `BookingForm.tsx` component stays mostly intact. Changes:

1. `handleSubmit` calls `submitBookingInquiry()` from `src/services/booking.ts` instead of fetching `bookingFormEndpoint` directly.
2. Remove `bookingFormEndpoint` / Formspree references from `site.ts`.
3. Add `VITE_BOOKING_API_URL` to `.env.example`.

---

## 5. Implementation Steps

### Step 1 — Cloudflare Worker

- Scaffold `worker/` directory with `wrangler.toml`, TypeScript config
- Implement `mailgun.ts` client (Mailgun API via `fetch` — no SDK needed)
- Implement email templates (notification + confirmation)
- Implement payload validation
- Implement worker entry point with CORS and error handling
- Add secrets via `wrangler secret put`

### Step 2 — Frontend Integration

- Create `src/services/booking.ts` client
- Update `BookingForm.tsx` to use the new client
- Update `.env.example` and site config
- Remove Formspree references

### Step 3 — Deploy & Verify

- Deploy worker via `wrangler deploy`
- Configure worker route for `djkmdlegends.com/api/*` in `wrangler.toml`
- Test end-to-end: form submit → notification email arrives → confirmation email arrives
- Verify CORS, error states, and validation behavior

---

## 6. Resolved Decisions

| # | Decision | Resolution |
|---|---|---|
| Q1 | Worker routing | Path-based: `djkmdlegends.com/api/*` — no extra DNS needed |
| Q2 | Rate limiting | Skip for now — low volume site; add later if abuse appears |
| Q3 | Confirmation email content | Include a summary of the submitted inquiry fields as a receipt |
| Q4 | Mailgun plan & domain | Free tier, API key active, custom domain `mg.djkmdlegends.com` already verified |
