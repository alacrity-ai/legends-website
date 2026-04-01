# Booking Form — Implementation Guide

Deterministic, step-by-step execution plan. Follow in order. Each step lists files to create/edit, what goes in them, and acceptance criteria.

**Prerequisite:** Mailgun account active, API key in hand, `mg.djkmdlegends.com` verified.

---

## Step 1 — Scaffold the Worker Project

### Files to create

**`worker/package.json`**
```json
{
  "name": "legends-booking-worker",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4",
    "typescript": "~5.9.3"
  }
}
```

**`worker/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**`worker/wrangler.toml`**
```toml
name = "legends-booking-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# Production route — path-based under the main domain
# routes = [{ pattern = "djkmdlegends.com/api/*", zone_name = "djkmdlegends.com" }]

[vars]
BOOKING_EMAIL = "booking@djkmdlegends.com"
ALLOWED_ORIGINS = "https://djkmdlegends.com,http://localhost:5173"
```

### Action
Run `cd worker && npm install` to generate lock file and pull dependencies.

### Acceptance criteria
- `worker/` directory exists with all three config files.
- `npm install` completes without errors.
- `npx wrangler --version` runs successfully from the worker directory.

---

## Step 2 — Worker Types

### File to create

**`worker/src/types.ts`**

Define the booking inquiry payload shape and the worker environment bindings.

```ts
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
```

### Acceptance criteria
- Types compile with no errors (`npx tsc --noEmit` from `worker/`).

---

## Step 3 — Payload Validation

### File to create

**`worker/src/validation.ts`**

Validate the incoming JSON body. Return the parsed `BookingInquiry` or throw with a descriptive message. Rules:

- `name` — required, non-empty string
- `email` — required, basic format check (contains `@`)
- `date` — required, non-empty string
- `location` — required, non-empty string
- `phone`, `eventType`, `message` — optional strings, pass through if present
- Reject unexpected/extra fields or oversized payloads (guard against abuse)

### Acceptance criteria
- Valid payload returns a `BookingInquiry` object.
- Missing `name` throws `"name is required"`.
- Missing `email` throws `"email is required"`.
- Email without `@` throws `"email is invalid"`.
- Missing `date` throws `"date is required"`.
- Missing `location` throws `"location is required"`.

---

## Step 4 — Mailgun Client

### File to create

**`worker/src/services/mailgun.ts`**

An isolated email-sending client. It knows how to talk to the Mailgun HTTP API and nothing else — no booking-specific logic.

**Interface:**
```ts
interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(
  message: EmailMessage,
  apiKey: string,
  domain: string
): Promise<{ success: boolean; error?: string }>
```

**Implementation details:**
- `POST https://api.mailgun.net/v3/{domain}/messages`
- Auth: `Authorization: Basic base64("api:" + apiKey)`
- Body: `multipart/form-data` — use the `FormData` API available in the Workers runtime (no npm packages needed)
  - Append fields: `from`, `to`, `subject`, `text`, `html`
  - If `replyTo` is provided, append as `h:Reply-To`
- Return `{ success: true }` on 200 response
- Return `{ success: false, error: response body message }` on non-200

### Acceptance criteria
- Function signature matches the interface above.
- Uses `FormData` (Web API, not an npm package).
- Auth header is correctly formatted as basic auth with `api` as the username.
- Non-200 responses are caught and returned as `{ success: false, error }` — never thrown.

---

## Step 5 — Email Templates

### Files to create

**`worker/src/templates/notification.ts`**

Builds the notification email sent to `booking@djkmdlegends.com`.

```ts
export function buildNotificationEmail(inquiry: BookingInquiry): {
  subject: string;
  text: string;
  html: string;
}
```

- Subject: `New Booking Inquiry — {name} — {date}`
- Text body: labeled list of all fields (name, email, phone, date, event type, location, message). Omit labels for fields that are empty.
- HTML body: simple styled version of the same — no complex layout needed, just readable. A `<table>` or `<dl>` of field labels and values is fine.

**`worker/src/templates/confirmation.ts`**

Builds the auto-confirmation email sent to the customer.

```ts
export function buildConfirmationEmail(inquiry: BookingInquiry): {
  subject: string;
  text: string;
  html: string;
}
```

- Subject: `We got your inquiry — DJKMD Legends`
- Body content:
  1. Greeting using their name
  2. Acknowledgment that we received their inquiry
  3. Summary of what they submitted (all fields, labeled)
  4. "We'll get back to you within 24 hours"
  5. Fallback contact: `booking@djkmdlegends.com`
- HTML version: clean, branded (use the gold `#d4af37` accent color for headings, dark `#0b0a0f` background, light `#f5f0e6` text — matches site tokens). Keep it simple — inline styles only, no external CSS.

### Acceptance criteria
- Both functions return `{ subject, text, html }`.
- Notification subject includes the customer's name and event date.
- Confirmation body includes a summary of all submitted fields.
- HTML emails render reasonably in a mail client (no broken tags).

---

## Step 6 — Worker Entry Point

### File to create

**`worker/src/index.ts`**

The Cloudflare Worker request handler. Single route: `POST /api/booking`.

**Responsibilities in order:**

1. **CORS** — Handle preflight `OPTIONS` requests. On all responses, set:
   - `Access-Control-Allow-Origin`: check the `Origin` header against `ALLOWED_ORIGINS` (comma-separated list from env). If it matches, reflect it. Otherwise, omit the header (request will fail CORS).
   - `Access-Control-Allow-Methods`: `POST, OPTIONS`
   - `Access-Control-Allow-Headers`: `Content-Type`

2. **Route guard** — Only accept `POST` to `/api/booking`. Return 405 for wrong method, 404 for wrong path.

3. **Parse & validate** — Read JSON body, pass through `validation.ts`. Return 400 with error message on failure.

4. **Send notification email** — Call `sendEmail` with:
   - `from`: `DJKMD Legends <noreply@{MAILGUN_DOMAIN}>`
   - `to`: `BOOKING_EMAIL` (from env)
   - Subject/text/html from `buildNotificationEmail()`

5. **Send confirmation email** — Call `sendEmail` with:
   - `from`: `DJKMD Legends <booking@{MAILGUN_DOMAIN}>`
   - `to`: customer email from the inquiry
   - `replyTo`: `booking@djkmdlegends.com`
   - Subject/text/html from `buildConfirmationEmail()`

6. **Response** — If both sends succeed, return `200 { success: true }`. If either fails, return `500 { error: "Failed to send email" }`. Do not leak Mailgun error details to the client.

### Acceptance criteria
- `OPTIONS /api/booking` returns 200 with CORS headers.
- `GET /api/booking` returns 405.
- `POST /api/other` returns 404.
- `POST /api/booking` with invalid JSON returns 400.
- `POST /api/booking` with valid payload calls `sendEmail` twice (notification + confirmation) and returns 200.
- Mailgun failures return 500 with a generic error — no API key or Mailgun internals exposed.
- CORS origin is validated against `ALLOWED_ORIGINS`.

---

## Step 7 — Frontend Booking Service

### File to create

**`src/services/booking.ts`**

Thin client that the form component calls. Isolates the API call so the component never knows about URLs or fetch details.

```ts
export interface BookingFormData {
  name: string;
  email: string;
  phone?: string;
  date: string;
  eventType?: string;
  location: string;
  message?: string;
}

export async function submitBookingInquiry(data: BookingFormData): Promise<void>
```

- Reads the worker URL from `import.meta.env.VITE_BOOKING_API_URL`.
- `POST`s JSON to `{url}/api/booking` with `Content-Type: application/json`.
- Throws on non-2xx or network error (caller handles the error state).

### Acceptance criteria
- Exports the function and the `BookingFormData` type.
- URL comes from the env var, not hardcoded.
- Throws on failure (does not silently swallow errors).

---

## Step 8 — Update BookingForm Component

### File to edit

**`src/components/marketing/BookingForm/BookingForm.tsx`**

Changes:

1. Import `submitBookingInquiry` from `../../services/booking.ts` (remove the `bookingFormEndpoint` import).
2. Replace the `handleSubmit` body:
   - Build a `BookingFormData` object from the form's `FormData`.
   - Call `await submitBookingInquiry(data)`.
   - On success: `setStatus('success')`, reset form.
   - On catch: `setStatus('error')`.
3. Everything else (JSX, field markup, status states, CSS) stays the same.

### Acceptance criteria
- No references to `bookingFormEndpoint` or Formspree remain in the component.
- Form still shows "Sending..." during submission, success message on 200, error message on failure.
- Form fields and layout are unchanged.

---

## Step 9 — Clean Up Site Config and Env

### Files to edit

**`src/content/site.ts`**
- Remove `bookingFormEndpoint` export and its `VITE_BOOKING_FORM_ENDPOINT` env reference.
- `bookingIntroCopy`, `eventTypes`, `bookingEmail` stay as-is.

**`.env.example`**
- Remove `VITE_BOOKING_FORM_ENDPOINT`.
- Add `VITE_BOOKING_API_URL` with a comment explaining it points to the worker (e.g. `https://djkmdlegends.com` in production, `http://localhost:8787` in local dev).

**`.github/workflows/deploy.yml`**
- Remove `VITE_BOOKING_FORM_ENDPOINT` from the build env block.
- Add `VITE_BOOKING_API_URL: ${{ secrets.VITE_BOOKING_API_URL }}` to the build env block.
- Add a new job (or step after the Pages deploy) that deploys the worker:
  - `cd worker && npm ci && npx wrangler deploy`
  - Requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (already available as secrets).

### Acceptance criteria
- No references to Formspree or `VITE_BOOKING_FORM_ENDPOINT` anywhere in the codebase.
- `.env.example` documents `VITE_BOOKING_API_URL`.
- Deploy workflow builds and deploys both the Pages site and the worker.

---

## Step 10 — Local Development Environment

### Context

In production, worker secrets (`MAILGUN_API_KEY`, `MAILGUN_DOMAIN`) are stored in Cloudflare via `wrangler secret put`. Locally, wrangler reads secrets from a `.dev.vars` file in the worker directory — this is wrangler's built-in mechanism. The frontend needs a `.env.local` pointing `VITE_BOOKING_API_URL` at the local worker. Docker Compose ties both services together for a single `docker compose up` workflow.

### Files to create

**`.gitignore`** — add `worker/.dev.vars` to prevent secrets from being committed.

**`worker/.dev.vars.example`** — documents the required local secrets (committed to git as a template).
```
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=mg.djkmdlegends.com
```

**`worker/.dev.vars`** — actual secrets file (gitignored). Copy from `.dev.vars.example` and fill in real values.

**`docker-compose.yml`** (project root) — runs both services:
- `site` service: Vite dev server on port 5173
- `worker` service: wrangler dev on port 8787
- Both use Node 24 image
- Frontend reads from root `.env.local` (or env set in compose)
- Worker reads from `worker/.dev.vars` (mounted into container)

**`Dockerfile`** (project root) — frontend dev container. Node 24, `npm ci`, runs `npm run dev -- --host 0.0.0.0`.

**`worker/Dockerfile`** — worker dev container. Node 24, `npm ci`, runs `npx wrangler dev --host 0.0.0.0 --port 8787`.

### Acceptance criteria
- `docker compose up` starts both services.
- Vite dev server accessible at `http://localhost:5173`.
- Worker accessible at `http://localhost:8787`.
- Submitting the booking form locally sends real emails via Mailgun (using `.dev.vars` secrets).
- No secrets in git — `.dev.vars` is gitignored.

---

## Step 11 — Deploy and End-to-End Verification

### Actions (manual)

1. **Set worker secrets:**
   ```bash
   cd worker
   npx wrangler secret put MAILGUN_API_KEY
   npx wrangler secret put MAILGUN_DOMAIN
   ```
   Enter `mg.djkmdlegends.com` for the domain, your Mailgun API key for the key.

2. **Deploy the worker:**
   ```bash
   cd worker && npx wrangler deploy
   ```

3. **Configure the route** in the Cloudflare dashboard (or uncomment and adjust the `routes` line in `wrangler.toml`):
   - Pattern: `djkmdlegends.com/api/*`
   - Zone: `djkmdlegends.com`

4. **Set the GitHub secret** `VITE_BOOKING_API_URL` to `https://djkmdlegends.com`.

5. **Deploy the site** via the GitHub Actions workflow (or manually build and deploy).

6. **Test end-to-end:**
   - Go to the live site, scroll to the booking form.
   - Fill in: name, email, phone, event date, event type, venue, message.
   - Click "Send Inquiry".
   - **Verify on-page:** Success message appears ("Thank you! Your booking inquiry has been sent.").
   - **Verify notification:** `booking@djkmdlegends.com` receives an email with all form fields.
   - **Verify confirmation:** The email address you entered receives a confirmation email with an inquiry summary and response-time expectation.
   - **Verify error handling:** Temporarily break the worker URL in dev, submit, confirm error state appears.

### Acceptance criteria
- Form submission from the live site results in two emails delivered.
- Notification email arrives at `booking@djkmdlegends.com` with correct subject and all fields.
- Confirmation email arrives at the customer's address with inquiry summary and "24 hours" language.
- On-page success/error states work correctly.
- No secrets are exposed in the frontend bundle or browser network tab.
