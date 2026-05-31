# v0.2 — Event Creation Form · IMPLEMENTATION

**Status:** Approved design → ready to build
**Design:** [`0-DESIGN.md`](./0-DESIGN.md)

### Approved decisions (locked)
1. **One Square payment link per ticket type** (MVP).
2. **Cloudflare R2** for images — token already has R2 read/write.
3. **One shared admin passcode** (`GUESTLIST_PASSCODE` generalized to `ADMIN_PASSCODE`, old name kept as alias).
4. **Create + delete only** (no in-place edit).

---

## How to use this document

Build in phases, **in order**. Each phase ends at a **checkpoint** that is independently verifiable — don't start the next phase until the current checkpoint passes. Phases 1–2 are infra/backend, 3–5 are the form + Square + images, 6–7 are public-site consumption, 8 is the legacy cutover, 9 is docs/deploy.

Conventions:
- **Worker** = `worker/` (Cloudflare Worker). **Frontend** = `src/` (React/Vite).
- Keep the existing house style: validation parsers in `worker/src/validation.ts`, JSON error shape `{ "error": "..." }`, Bearer-passcode auth via `isAuthorized()`.
- Run `make lint` and (worker) `cd worker && npx tsc --noEmit` after each phase.

---

## Phase 0 — Branch & scaffolding

**Goal:** a working branch and the doc folders in place.

1. `git checkout -b feat/event-form` off `main`.
2. Confirm sandbox Square creds are available locally for later phases (you'll put them in `worker/.dev.vars` in Phase 4). Do **not** commit them.

**Checkpoint:** branch exists; `make build` and `cd worker && npx tsc --noEmit` both pass on a clean tree.

---

## Phase 1 — Infra & config (KV, R2, env, types)

**Goal:** all bindings and shared types exist before any code uses them. No behavior change yet.

### Steps
1. **Create the KV namespace** `EVENTS` (prod + preview):
   ```bash
   cd worker
   npx wrangler kv namespace create EVENTS
   npx wrangler kv namespace create EVENTS --preview
   ```
2. **Create the R2 bucket** `EVENT_IMAGES`:
   ```bash
   npx wrangler r2 bucket create legends-event-images
   ```
3. **Wire `worker/wrangler.toml`** — add under the existing bindings:
   ```toml
   [[kv_namespaces]]
   binding = "EVENTS"
   id = "<from step 1>"
   preview_id = "<from step 1 --preview>"

   [[r2_buckets]]
   binding = "EVENT_IMAGES"
   bucket_name = "legends-event-images"
   preview_bucket_name = "legends-event-images"

   [vars]
   # ...existing vars...
   SQUARE_ENVIRONMENT = "production"      # sandbox in .dev.vars for local
   LEGACY_CALENDAR_ENABLED = "true"       # transition flag (Phase 8)
   ```
4. **Extend `worker/src/types.ts`** with the new types:
   ```ts
   export interface TicketConfig {
     ticketType: string;
     priceCents: number;
   }
   export interface EventTicket extends TicketConfig {
     checkoutUrl: string;
     squarePaymentLinkId: string;
     squareOrderId: string;
   }
   export interface EventRecord {
     id: string;
     showName: string;
     description: string;
     venueName: string;
     venueAddress: string;
     startTime: string;   // ISO 8601 with offset
     endTime: string;     // ISO 8601 with offset
     imageKey: string;    // R2 object key
     tickets: EventTicket[];
     createdAt: string;
     source: 'form' | 'google-calendar';
   }
   ```
   And extend `Env`:
   ```ts
   EVENTS: KVNamespace;
   EVENT_IMAGES: R2Bucket;
   ADMIN_PASSCODE: string;           // new canonical name
   GUESTLIST_PASSCODE?: string;      // legacy alias (optional)
   SQUARE_ACCESS_TOKEN: string;
   SQUARE_LOCATION_ID: string;
   SQUARE_ENVIRONMENT: 'sandbox' | 'production';
   LEGACY_CALENDAR_ENABLED: string;  // "true" | "false"
   ```
5. **Update `worker/.dev.vars.example`** (no real secrets — placeholders only):
   ```
   ADMIN_PASSCODE=your-passcode
   SQUARE_ACCESS_TOKEN=your-square-sandbox-access-token
   SQUARE_LOCATION_ID=your-square-location-id
   SQUARE_ENVIRONMENT=sandbox
   ```

**Checkpoint:** `cd worker && npx tsc --noEmit` passes; `npx wrangler dev` boots without binding errors (`/api/events` still returns the legacy calendar payload — unchanged).

---

## Phase 2 — Admin auth generalization

**Goal:** the existing Bearer-passcode gate works for both the guestlist and the new admin routes, reading `ADMIN_PASSCODE` with a fallback to `GUESTLIST_PASSCODE`.

### Steps (Worker)
1. In `worker/src/index.ts`, add a helper:
   ```ts
   function adminPasscode(env: Env): string {
     return env.ADMIN_PASSCODE || env.GUESTLIST_PASSCODE || '';
   }
   ```
2. Replace `env.GUESTLIST_PASSCODE` in `handleGuestlist`'s `isAuthorized(...)` call with `adminPasscode(env)`.
3. Leave the existing guestlist routes otherwise untouched.

**Checkpoint:** guestlist still authorizes with the current passcode value set as either var; `tsc --noEmit` passes.

---

## Phase 3 — Server: validation for the event draft

**Goal:** a pure, tested-by-hand parser that turns untrusted form input into a safe `EventRecord` draft. No Square/R2 yet.

### Steps (Worker)
1. In `worker/src/validation.ts`, add `parseEventDraft(payload: unknown)` returning the non-derived fields + validated `tickets: TicketConfig[]`. Enforce the rules from design §6:
   - `showName` ≤ 200, `description` ≤ 5000, `venueName` ≤ 200, `venueAddress` ≤ 500 — all non-empty (reuse `requireString`).
   - `startTime`/`endTime`: parse with `new Date(...)`, reject `NaN`; `start` must be in the future; `end` strictly after `start`.
   - `tickets`: array length 1..10; each `ticketType` non-empty ≤ 100, **unique case-insensitive**; each `price` → integer cents via `Math.round(price * 100)`, must satisfy `0 < cents ≤ 10_000_000`.
   - Reject unknown top-level keys (mirror existing parsers).
2. Add `MAX_TICKETS = 10` and any price bounds as module constants.

**Checkpoint:** unit-style sanity — temporarily call `parseEventDraft` from a scratch route or a node REPL against good/bad inputs; confirm clear error messages. Remove scratch code before commit.

---

## Phase 4 — Server: Square payment-link service

**Goal:** `createPaymentLink()` that creates one Square link, modeled on `reference_repos/LeaseKitAI-webapp/apps/api/src/services/square.ts`.

### Steps (Worker)
1. Create `worker/src/services/square.ts`:
   - `apiBase(env)` → `connect.squareup.com` (production) / `connect.squareupsandbox.com` (sandbox).
   - `SQUARE_API_VERSION = '2025-01-23'`.
   - `createPaymentLink(env, { eventId, ticketType, amountCents, redirectUrl })`:
     - POST `/v2/online-checkout/payment-links` with `quick_pay` (name = `"<showName> — <ticketType>"`), `price_money { amount, currency: 'USD' }`, `location_id`, `checkout_options.redirect_url`, `payment_note = "legends-event:<eventId>:<ticketType>"`, `idempotency_key = crypto.randomUUID()`.
     - On non-OK / missing `payment_link`, throw with Square's `errors[].detail`.
     - Return `{ checkoutUrl, paymentLinkId, orderId }`.
   - (Optional, for cleanup in Phase 5) `deactivatePaymentLink(env, id)` → `DELETE /v2/online-checkout/payment-links/{id}` best-effort.
2. Put real **sandbox** creds in `worker/.dev.vars` (gitignored).

**Checkpoint:** with `wrangler dev` and sandbox creds, call `createPaymentLink` from a temporary route once; confirm a real sandbox `checkoutUrl` comes back and opens in a browser. Remove the temp route.

---

## Phase 5 — Server: create/list/delete event endpoints + image serving

**Goal:** the full admin event API and the public image route.

### Steps (Worker — `worker/src/index.ts`)
1. **Router:** add before the 404:
   ```ts
   if (url.pathname.startsWith('/api/admin/events')) {
     return handleAdminEvents(request, url, env, corsHeaders);
   }
   const imgMatch = url.pathname.match(/^\/api\/events\/([a-f0-9-]+)\/image$/);
   if (imgMatch) return handleEventImage(imgMatch[1], env, corsHeaders);
   ```
   Also add `PUT`/`DELETE` already covered by CORS methods — extend `Access-Control-Allow-Methods` if needed (it already lists GET, POST, DELETE, OPTIONS — fine).
2. **`handleAdminEvents`** — gate with `isAuthorized(request, adminPasscode(env))` → 401 if not. Then:
   - `POST /api/admin/events` → `handleCreateEvent`.
   - `GET /api/admin/events` → list all `event:*` from KV (parsed), sorted by `startTime` desc.
   - `DELETE /api/admin/events/:id` → delete KV record; best-effort `deactivatePaymentLink` for each ticket; best-effort `EVENT_IMAGES.delete(imageKey)`.
3. **`handleCreateEvent`** — the multipart flow (design §8.1, §9.3):
   1. `const form = await request.formData()`; read `payload` (JSON string) + `image` (File).
   2. `parseEventDraft(JSON.parse(payload))` → 400 on failure.
   3. Validate image: `image instanceof File`, `image.type` ∈ {jpeg,png,webp}, `image.size ≤ 5MB` → 400.
   4. `const id = crypto.randomUUID()`.
   5. **Create Square links** for each ticket (sequential, collect results). If any throws → best-effort deactivate the ones already created, return 502 `{ error: "Square: <type> failed: ..." }`. **Do not persist.**
   6. **Store image** to R2: `const ext = extFromMime(image.type); const imageKey = \`events/${id}.${ext}\`; await env.EVENT_IMAGES.put(imageKey, await image.arrayBuffer(), { httpMetadata: { contentType: image.type } })`. On failure → 500.
   7. **Write KV** `event:${id}` = `JSON.stringify(record)` (commit point). On failure → 500.
   8. Return `200 { event: record }` with `Cache-Control: no-store`.
4. **`handleEventImage(id, env, cors)`** — `GET`: read `event:${id}` from KV → 404 if missing → `EVENT_IMAGES.get(record.imageKey)`; stream body with `Content-Type` from R2 metadata and `Cache-Control: public, max-age=31536000, immutable`.

**Checkpoint (backend complete):** via `curl`/Postman against `wrangler dev` with the passcode header and a multipart body (fields + a small image):
- create returns an event with N `checkoutUrl`s;
- `GET /api/events/:id/image` returns the image bytes;
- `GET /api/admin/events` lists it;
- `DELETE /api/admin/events/:id` removes it;
- unauthorized requests get 401. `tsc --noEmit` clean.

---

## Phase 6 — Server: public `GET /api/events` reads KV (+ legacy merge)

**Goal:** the public events feed serves form-created events, optionally merged with legacy calendar events behind the flag.

### Steps (Worker)
1. Add `eventRecordToPublic(record): PublicEvent` mapping `EventRecord` → the public shape (design §8.3): split `startTime` into `date` (`YYYY-MM-DD`) + `time` (`HH:MM`), derive `endTime` (`HH:MM`), `location = "<venueName>, <venueAddress>"`, `imageUrl = "/api/events/<id>/image"`, `tickets: [{ ticketType, priceCents, checkoutUrl }]`.
2. Rewrite `handleEvents`:
   - Read all `event:*` from KV, parse, **filter to `endTime`/`startTime` in the future**, map to public shape.
   - If `env.LEGACY_CALENDAR_ENABLED === 'true'`: also `fetchUpcomingEvents(...)` (existing), map those (no `id`/`tickets`/`imageUrl`; keep `description` for the legacy Square-link parse on the client).
   - Merge, sort by start ascending, return `{ events }` with `Cache-Control: public, max-age=60`.

**Checkpoint:** `/api/events` returns created KV events (and legacy ones while flag on), sorted, future-only.

---

## Phase 7 — Frontend: admin shell, the form, and public rendering

**Goal:** staff can reach the form at `/admin/events/new`, submit it, and see the show live with per-ticket Buy buttons.

### 7a — Routing & admin shell
1. **`src/app/App.tsx`** — add `isAdminRoute()` (path starts with `/admin`). Render an `<Admin />` shell for admin routes; keep `/guestlist` working (treat as alias → admin check-in).
2. **`src/components/admin/Admin.tsx`** — passcode sign-in (reuse the `SignIn` pattern / `services/guestlist.ts` passcode storage; rename storage key is optional). Once signed in, a simple menu:
   - **Door Check-in** → renders existing `<Guestlist />`.
   - **Create Show** → renders `<EventForm />`.
   Sub-route off `window.location.pathname` (`/admin/checkin`, `/admin/events/new`) or in-component tab state — either is fine for MVP.

### 7b — Event service (frontend)
3. **`src/services/admin-events.ts`** — reuse the Bearer-passcode `request` pattern. `createEvent(formData: FormData)` POSTs `multipart/form-data` (don't set `Content-Type` manually — let the browser set the boundary; send passcode header). Add `listEvents()` and `deleteEvent(id)`.

### 7c — The form component
4. **`src/components/admin/EventForm/EventForm.tsx`** (+ CSS module) — fields per design §5:
   - text inputs (show name, venue name, venue address), textarea (description), two `datetime-local` inputs (start/end).
   - **Ticket rows:** array state of `{ ticketType, price }`; "+ Add ticket type" / remove (✕ hidden when one row); validate unique non-empty types, price > 0.
   - **Image:** `<input type="file" accept="image/*">` with a thumbnail preview (`URL.createObjectURL`).
   - **Client validation** mirrors §6; convert start/end to ISO with the **America/New_York** offset before building the payload; convert prices to display but send dollars (server rounds to cents).
   - **Submit:** build `FormData` with `payload` (JSON) + `image` (File); call `createEvent`. Show submitting/success/error states (§5.2); on success show "✅ live" + link to `/#calendar` + "Create another".

### 7d — Public rendering
5. **`src/types/event.ts`** — extend `CalendarEvent` with `id?`, `endTime?`, `imageUrl?`, and `tickets?: { ticketType: string; priceCents: number; checkoutUrl: string }[]`.
6. **`src/components/marketing/Calendar/Calendar.tsx`** — render `event.imageUrl` (when present) on the card; `key` uses `event.id ?? \`${event.date}-${i}\``.
7. **`src/components/marketing/TicketModal/TicketModal.tsx`** — if `tickets?.length`, render the image, description, and **one Buy button per ticket** labeled `"<ticketType> — $<price>"` linking to `checkoutUrl`. Else fall back to the legacy `parseDescription` path (so calendar-sourced events still work during transition).

**Checkpoint (feature works end-to-end, local):** with `wrangler dev` + `vite dev`, sign in at `/admin`, create a show with two ticket types and an image; confirm it appears under Upcoming Shows with the image, and the ticket modal shows two Buy buttons that open the sandbox checkout. Delete it from `/admin` and confirm it disappears.

---

## Phase 8 — Legacy Google Calendar: grandfather now, cutover ~September

**Goal:** ship v0.2 with legacy support **left ON** so the 2 existing Google Calendar shows (which have real, active bookings on their pasted Square links) keep working untouched until they conclude around September 2026. The cutover is a separate, later action — **not** part of the initial launch.

> ⚠️ Do **not** disable legacy, delete the 2 calendar events, or remove `GOOGLE_API_KEY` / `GOOGLE_CALENDAR_ID` as part of landing this feature. The whole point of the cross-compatible feed (Phase 6) is that both systems coexist during the grandfathering window.

### Steps — at launch (now)
1. Ship with `LEGACY_CALENDAR_ENABLED = "true"`. Verify the feed shows **both** the 2 legacy calendar shows (legacy Square link via the modal's `parseDescription` fallback) **and** any new form-created shows, correctly sorted and de-duplicated.
2. Do **not** re-enter the 2 grandfathered shows through the form (avoid duplicates). New shows from this point go through the form; the legacy two are left exactly as they are.

### Steps — at cutover (after the last grandfathered show date, ~September 2026)
3. Confirm both legacy shows are in the past (so they've dropped out of the future-only feed anyway).
4. Set `LEGACY_CALENDAR_ENABLED = "false"` in `wrangler.toml` and deploy. `/api/events` now reads KV only — a no-op for the public feed at that point, it just stops querying Google Calendar.
5. Leave `services/google-calendar.ts` and `utils/parse-description.ts` in place but dormant (delete in a later cleanup PR once confident — design §11 step 3). `GOOGLE_API_KEY` / `GOOGLE_CALENDAR_ID` can be removed at that cleanup.

**Checkpoint (launch):** flag ON — feed contains both legacy and new shows; the 2 legacy shows' Buy buttons still open their existing Square checkouts.
**Checkpoint (cutover, later):** flag OFF after September — `/api/events` returns only form events; site renders correctly.

---

## Phase 9 — Secrets, deploy, docs

**Goal:** production-ready.

### Steps
1. **Set production Worker secrets** (never commit; values from `DO_NOT_COMMIT.md`):
   ```bash
   cd worker
   npx wrangler secret put ADMIN_PASSCODE
   npx wrangler secret put SQUARE_ACCESS_TOKEN     # production token
   npx wrangler secret put SQUARE_LOCATION_ID
   ```
   Set `SQUARE_ENVIRONMENT = "production"` in `[vars]`.
2. **Deploy:** run the GitHub Actions "Deploy to Cloudflare Pages" workflow (frontend + worker), or `make deploy-worker` for worker-only iterations.
3. **Smoke test production** with a **$0.01-or-cancel** sandbox-style check if possible, or create-then-delete a throwaway show.
4. **Docs:**
   - Replace `docs/EVENT_CREATION_GUIDE.md` with a short operator guide for the new form.
   - Update `docs/resources/1-SOPS.md` **SOP 2** (show creation) to point at the form instead of Calendar+Square.
   - Update `docs/resources/0-HIGH_LEVEL.md` (events now first-party; Google Calendar = legacy).
   - Update root `README.md` env/worker tables with the new bindings/secrets.

**Checkpoint:** production create → visible on site → Buy opens real Square checkout → delete works. Merge `feat/event-form` to `main`.

---

## File change inventory (quick reference)

**Worker (new):** `src/services/square.ts`.
**Worker (edit):** `wrangler.toml`, `.dev.vars.example`, `src/types.ts`, `src/validation.ts`, `src/index.ts`.
**Frontend (new):** `src/components/admin/Admin.tsx`, `src/components/admin/EventForm/EventForm.{tsx,module.css}`, `src/services/admin-events.ts`.
**Frontend (edit):** `src/app/App.tsx`, `src/types/event.ts`, `src/components/marketing/Calendar/Calendar.tsx`, `src/components/marketing/TicketModal/TicketModal.tsx`.
**Docs (edit):** `docs/EVENT_CREATION_GUIDE.md`, `docs/resources/{0-HIGH_LEVEL,1-SOPS}.md`, `README.md`.

## Risk notes
- **Multipart in Workers:** `request.formData()` handles file uploads; keep the 5 MB cap to stay within Worker limits.
- **Partial failure:** event is persisted **only after** all Square links + image succeed (KV write is the commit point) — no half-created shows in the feed.
- **Double-submit:** button disables on submit; no server-side idempotency for the whole form in MVP (acceptable — delete the dupe). Future: client draft id.
- **Secrets hygiene:** Square/admin secrets live only in `.dev.vars` (local) and `wrangler secret` (prod); never in the repo.
