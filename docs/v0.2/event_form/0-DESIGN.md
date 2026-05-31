# v0.2 — Event Creation Form · DESIGN

**Status:** Draft for approval
**Author:** (onboarding/dev)
**Supersedes:** the Google Calendar event flow (`docs/EVENT_CREATION_GUIDE.md`) — see [§11 Legacy](#11-legacy-google-calendar-migration)

---

## 1. Summary & goals

Today, shows are created by hand in **Google Calendar**, and ticketing is bolted on by pasting a manually-created **Square** payment link into the event description. The site's Worker reads the calendar (`GET /api/events`) and the frontend parses the Square URL back out of the description.

This is fragile and requires two disconnected manual steps in two products. **v0.2 replaces it with a single in-house Event Creation Form**, gated inside the staff admin area (next to the door check-in app). A scheduler fills one form; on submit the Worker:

1. validates the input,
2. calls the **Square API** to create the ticket **payment link(s)** automatically (one per ticket type),
3. stores the uploaded show image,
4. persists the event to storage,

…and the public site renders it under **Upcoming Shows** with working **Buy** buttons — no Google Calendar, no copy-pasting links.

**Google Calendar becomes legacy:** still readable during a transition window, then retired.

### Goals
- One simple form, usable by non-technical scheduling staff, produces a fully ticketed, live show.
- Square payment links are created programmatically (no manual Square steps).
- Support **1..N price configurations** per show (e.g. "Show Only", "Dinner + Show").
- Upload a show image directly from the staff member's machine.
- Live within seconds of submit, no code deploy.

### Non-goals (this version)
- Editing/rescheduling an existing event through the UI (delete + recreate is acceptable for MVP — see [§13](#13-open-decisions)).
- Inventory caps / sold-out logic / per-ticket quantity limits.
- Automatic guestlist roster building from purchases (still done via Square CSV → `tools/ingest-guestlist.mjs`; webhook auto-build is a future item, [§14](#14-future-work)).
- Replacing the public booking form or mailing list.

---

## 2. Terminology

| Term | Meaning |
| --- | --- |
| **Event / Show** | A single live performance with a date, venue, image, description, and one or more ticket types. |
| **Price configuration / Ticket type** | A `{ ticketType, price }` pair, e.g. `{ "Dinner + Show", 75.00 }`. Each maps to its own Square payment link. |
| **Payment link** | A Square-hosted checkout URL (`https://square.link/u/...` / `connect…/checkout`) the buyer is sent to. |
| **Admin section** | Passcode-gated staff area hosting the check-in app and (new) the event form. |

---

## 3. Current vs. target architecture

```
CURRENT (v0.1)
  Staff → Google Calendar event  ─┐
  Staff → Square dashboard link  ─┘ (pasted into event description)
                  │
   Worker GET /api/events → Google Calendar API → parse square.link out of description
                  │
            Public site renders shows + Buy button

TARGET (v0.2)
  Staff → /admin → Event Form ──POST /api/admin/events (multipart)──► Worker
                                                                       │
                              ┌────────────────────────────────────────┤
                              ▼                  ▼                      ▼
                    Square API (create     R2 bucket (store        KV EVENTS
                    payment link / type)    show image)         (event record)
                              │
   Worker GET /api/events ◄── reads KV EVENTS (+ legacy calendar during transition)
                  │
            Public site renders shows + per-ticket-type Buy buttons
```

---

## 4. Admin section & auth

### 4.1 Routing
The app is a single React bundle that route-switches in `App.tsx`. Today: `/guestlist` → check-in app, everything else → marketing site. We introduce an **admin shell**:

| Path | Renders |
| --- | --- |
| `/admin` | Admin home: passcode sign-in, then a menu linking to the two tools |
| `/admin/checkin` | The existing guestlist/check-in app (moved under `/admin`) |
| `/admin/events/new` | **New: the Event Creation Form** |
| `/guestlist` | Kept as a redirect/alias to `/admin/checkin` for back-compat |

`App.tsx` gains an `isAdminRoute()` check mirroring the existing `isGuestlistRoute()`.

### 4.2 Authentication
Reuse the **shared-passcode / Bearer-token** pattern already used by the guestlist (`worker/src/index.ts` `isAuthorized()` + `constantTimeEqual()`, frontend `services/guestlist.ts` storing the passcode in `localStorage` and sending `Authorization: Bearer <passcode>`).

- The existing `GUESTLIST_PASSCODE` is **generalized** to gate the whole admin section. Recommended: rename the env var to **`ADMIN_PASSCODE`** (keep `GUESTLIST_PASSCODE` as an accepted alias for one release to avoid a flag-day).
- All new admin endpoints (`/api/admin/*`) require the same Bearer check.
- **The Square access token never reaches the browser.** It lives only in Worker secrets; the form talks to our Worker, the Worker talks to Square. The passcode only authorizes *use* of that server-side capability.

> Security note: this is a low-sensitivity shared passcode (same trust level as the current door code). It is adequate for "let trusted staff create shows," but it is not per-user auth. Per-user accounts are out of scope ([§14](#14-future-work)).

---

## 5. The form (UX)

A single-column form at `/admin/events/new`, styled to match the site, optimized for clarity over density. All fields below are **required**.

| # | Field | Control | Notes |
| --- | --- | --- | --- |
| 1 | **Show Name** | single-line text | e.g. "DJKMD Presents Legends — Summer Spectacular" |
| 2 | **Description** | multi-line textarea | The blurb buyers see. Plain text; newlines preserved. |
| 3 | **Venue Name** | single-line text | e.g. "The Blue Note" |
| 4 | **Venue Address** | single-line text (or textarea) | Full street address; becomes a Google Maps link on the site |
| 5 | **Start time** | `datetime-local` | Local New England time; see [§7.3](#73-dates--timezones) |
| 6 | **End time** | `datetime-local` | Must be after start |
| 7 | **Price configurations** | **repeatable row group** | 1..N rows, each: `Ticket type` (text) + `Price (USD)` (number). "+ Add ticket type" / "Remove" buttons. Defaults to one empty row. |
| 8 | **Image** | file picker (`<input type="file">`) | Upload from local machine. Shows a thumbnail preview before submit. |
| — | **Submit** | button | "Create Show". Disabled while submitting. |

### 5.1 Price configuration UI
```
Ticket types
┌─────────────────────────────┬──────────────┬────────┐
│ Ticket type                 │ Price (USD)  │        │
├─────────────────────────────┼──────────────┼────────┤
│ [ Show Only              ]  │ [ 45.00 ]    │ [ ✕ ]  │
│ [ Dinner + Show          ]  │ [ 75.00 ]    │ [ ✕ ]  │
└─────────────────────────────┴──────────────┴────────┘
                                          [ + Add ticket type ]
```
- At least one row required; the ✕ is hidden when only one row remains.
- Ticket-type labels must be unique within the show (case-insensitive).

### 5.2 Form states
- **Idle/editing** — inline per-field validation on blur and on submit.
- **Submitting** — button shows a spinner ("Creating show…"); form disabled. This step is slower than a normal form because the Worker makes N Square API calls + an image upload; show clear progress.
- **Success** — confirmation panel: "✅ '{Show Name}' is live." with a link to view it on the site and a "Create another" button.
- **Error** — a banner with the server's message (e.g. "Square rejected the price for 'Dinner + Show'"). The form keeps the entered values so nothing is lost. Partial-failure handling: see [§9.3](#93-error--partial-failure-handling).

---

## 6. Validation rules

Enforced **client-side** (fast feedback) **and** re-enforced **server-side** (source of truth) in a new `worker/src/validation.ts` parser `parseEventDraft()`.

| Field | Rule |
| --- | --- |
| Show Name | non-empty, ≤ 200 chars |
| Description | non-empty, ≤ 5000 chars |
| Venue Name | non-empty, ≤ 200 chars |
| Venue Address | non-empty, ≤ 500 chars |
| Start time | valid ISO datetime, **in the future** |
| End time | valid ISO datetime, **strictly after** start |
| Price configs | array length 1..10; each `ticketType` non-empty ≤ 100 chars & unique (case-insensitive); each `price` a number `0 < price ≤ 100000`, stored as **integer cents** |
| Image | present; MIME in `{image/jpeg, image/png, image/webp}`; ≤ **5 MB**; (optional) min dimensions |

Validation errors return HTTP **400** with `{ "error": "<human message>" }`, matching the existing convention.

---

## 7. Data model & storage

### 7.1 Event record (stored in KV namespace `EVENTS`)
Key: `event:<uuid>`. Value (JSON):

```jsonc
{
  "id": "9f2c…",                         // uuid (worker-generated)
  "showName": "Summer Spectacular",
  "description": "Come see Legends…",     // plain text, newlines preserved
  "venueName": "The Blue Note",
  "venueAddress": "123 Main St, Springfield, MA",
  "startTime": "2026-07-12T20:00:00-04:00",  // ISO 8601 w/ offset
  "endTime":   "2026-07-12T23:00:00-04:00",
  "imageKey":  "events/9f2c….webp",       // R2 object key
  "tickets": [
    {
      "ticketType": "Show Only",
      "priceCents": 4500,
      "checkoutUrl": "https://square.link/u/AbC123",
      "squarePaymentLinkId": "PL_…",
      "squareOrderId": "ORD_…"
    },
    { "ticketType": "Dinner + Show", "priceCents": 7500, "checkoutUrl": "…", "squarePaymentLinkId": "…", "squareOrderId": "…" }
  ],
  "createdAt": "2026-05-31T18:04:00Z",
  "source": "form"                        // vs "google-calendar" for legacy
}
```

> KV listing for the public endpoint: store under a predictable prefix (`event:`) and read with `EVENTS.list({ prefix: 'event:' })`. For a small number of upcoming shows this is fine. (If volume grows, add a secondary index key; out of scope now.)

### 7.2 Image storage — Cloudflare R2
Add an **R2 bucket** binding `EVENT_IMAGES`. On submit, the Worker writes the uploaded file to `events/<uuid>.<ext>` and stores the key on the event. Images are served back via a Worker route (see [§8](#8-api)) so we don't need a public bucket or a separate CDN domain.

*(Alternative considered: base64 the image into KV. Rejected — binary in KV is wasteful and complicates serving. R2 is the right primitive; this is the one new piece of infra v0.2 adds.)*

### 7.3 Dates & timezones
The form's `datetime-local` yields a wall-clock time with no zone. The client converts to an ISO string **with the America/New_York offset** before sending (all shows are in New England). The Worker stores it verbatim. The public Calendar component already formats from an ISO-ish date/time, so its rendering path is reused.

---

## 8. API

All under the Worker (`worker/src/index.ts`). New admin routes are Bearer-gated; the public route is open (as today).

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/admin/events` | admin | Create an event (multipart). Body = form fields + image file. Creates Square links, stores image + record. Returns the created event. |
| `GET /api/admin/events` | admin | List events for management (incl. past), for a future admin list view. |
| `DELETE /api/admin/events/:id` | admin | Remove an event (and optionally deactivate its Square links). |
| `GET /api/events` | public | **Changed:** upcoming events from KV `EVENTS` (+ legacy calendar during transition), shaped for the site. |
| `GET /api/events/:id/image` | public | Stream the show image from R2 with long cache headers. |

### 8.1 `POST /api/admin/events` — request
`Content-Type: multipart/form-data` (chosen so the image and fields submit in one request — simplest for staff). Parts:
- `payload` — JSON string of all non-file fields (showName, description, venueName, venueAddress, startTime, endTime, tickets[]).
- `image` — the file.

The Worker parses with `await request.formData()` (supported in Workers).

### 8.2 `POST /api/admin/events` — success response
```json
{ "event": { /* the stored event record, §7.1 */ } }
```

### 8.3 Public `GET /api/events` shape
Extended `CalendarEvent` so the frontend can render image + multiple ticket buttons. Back-compat: keep `title/date/time/location/description`, add new fields:

```jsonc
{
  "events": [
    {
      "id": "9f2c…",
      "title": "Summer Spectacular",
      "date": "2026-07-12",
      "time": "20:00",
      "endTime": "23:00",
      "location": "The Blue Note, 123 Main St, Springfield, MA",
      "description": "Come see Legends…",
      "imageUrl": "/api/events/9f2c…/image",
      "tickets": [
        { "ticketType": "Show Only", "priceCents": 4500, "checkoutUrl": "https://square.link/u/AbC123" },
        { "ticketType": "Dinner + Show", "priceCents": 7500, "checkoutUrl": "…" }
      ]
    }
  ]
}
```
Note: `checkoutUrl` is the only Square field exposed publicly; payment-link/order IDs stay server-side.

---

## 9. Square integration

Modeled on the proven reference in `reference_repos/LeaseKitAI-webapp/apps/api/src/services/square.ts` (`createPaymentLink` via the `quick_pay` flow). New file: `worker/src/services/square.ts`.

### 9.1 One payment link per ticket type
Square `quick_pay` payment links are **single-price**. To let a buyer choose between "Show Only" and "Dinner + Show", we create **one payment link per ticket type** and render one Buy button per type in the ticket modal. For each ticket config the Worker POSTs to `/v2/online-checkout/payment-links`:

```jsonc
{
  "idempotency_key": "<uuid>",            // unique per link; safe to retry
  "quick_pay": {
    "name": "Summer Spectacular — Dinner + Show",
    "price_money": { "amount": 7500, "currency": "USD" },
    "location_id": "<SQUARE_LOCATION_ID>"
  },
  "checkout_options": {
    "redirect_url": "https://djkmdlegends.com/?purchase=success",
    "ask_for_shipping_address": false
  },
  "payment_note": "legends-event:<eventId>:<ticketType>"   // correlation for CSV/guestlist
}
```
- `payment_note` ties Square orders back to our event + ticket type — useful for the existing Square-CSV → guestlist flow.
- API base + version follow the reference: `connect.squareup.com` (prod) / `connect.squareupsandbox.com` (sandbox), `Square-Version: 2025-01-23`.

*(Alternative considered: a single Catalog item with variations + one payment link. Richer Square-side reporting, but more API surface (catalog create/upsert) and Square's hosted checkout variation UX is heavier. Deferred; the N-links approach matches the working reference and gives us clean per-type buttons. Revisit if Square reporting needs it.)*

### 9.2 Configuration (Worker secrets/vars)
From the `ticket_tracker` Square app (credentials in the gitignored `DO_NOT_COMMIT.md` — **never** commit them; set as Worker secrets):

| Name | Type | Notes |
| --- | --- | --- |
| `SQUARE_ACCESS_TOKEN` | secret | sandbox token for dev, production token for prod |
| `SQUARE_LOCATION_ID` | secret/var | the location to attach links to |
| `SQUARE_ENVIRONMENT` | var | `sandbox` \| `production` (selects API base) |

Local dev uses the **sandbox** credentials via `worker/.dev.vars`; production uses Worker secrets set with `wrangler secret put`.

### 9.3 Error & partial-failure handling
The create flow is multi-step (N Square calls → image → KV). Order of operations and failure policy:

1. **Validate** everything first (cheap, no side effects).
2. **Create all Square links.** If any link fails, **abort**: do not persist the event, return 400/502 with which ticket type failed. (Best-effort: attempt to deactivate any links already created this request so we don't leak orphans — or accept rare orphan links and note them; see [§13](#13-open-decisions).)
3. **Upload image to R2.** On failure, abort and return 500.
4. **Write event to KV** last (the commit point). If KV write fails after links exist, return 500; the links are orphaned but harmless (no event references them).

Idempotency keys make step 2 retry-safe within a request. There is no cross-request idempotency for the whole form (a double-click could create two shows) — the client disables the button on submit, and a future improvement is a client-generated draft id.

---

## 10. Frontend changes (public site)

- **`types/event.ts`** — extend `CalendarEvent` with `id`, `endTime`, `imageUrl`, `tickets[]`.
- **`Calendar.tsx`** — render the show image on each card; otherwise unchanged (still maps events to cards with a "Buy Tickets" button).
- **`TicketModal.tsx`** — instead of parsing a Square link out of the description ([`parse-description.ts`](../../../src/utils/parse-description.ts), now legacy), render the show image, the description, and **one Buy button per `tickets[]` entry**, each labeled with its ticket type and price (e.g. "Dinner + Show — $75"). Each button links to that ticket's `checkoutUrl`.
- `parse-description.ts` is retained only for rendering legacy calendar-sourced events during the transition, then deleted.

---

## 11. Legacy Google Calendar — grandfathering & migration

**Constraint (important):** there are **2 live Google Calendar shows with real bookings already happening** on their pasted Square links. These must stay **fully functional and untouched on the site until ~September 2026**, when those shows conclude. The new system runs **alongside** them — not instead of them — for the whole grandfathering window. No reworking, re-creating, or migrating those 2 shows is required (or wanted).

This is handled natively by the cross-compatible feed (no special-casing): the public `GET /api/events` **merges** both sources, and the ticket modal renders new-style per-ticket buttons *or* falls back to the legacy `parseDescription` Square-link path per event (design §10). Google Calendar reading stays on, gated by the Worker var `LEGACY_CALENDAR_ENABLED`:

1. **Grandfathering window (now → ~Sept 2026, flag = `true`):** `GET /api/events` returns **KV events + legacy calendar events**, merged and sorted by start time, de-duplicated by title+date. New shows go through the form; the 2 legacy calendar shows keep working exactly as they do today, including their existing Square checkout links.
2. **Cutover (~Sept 2026, after the legacy shows have passed):** set `LEGACY_CALENDAR_ENABLED = "false"` and deploy; `/api/events` then reads KV only. Because past events are already filtered out of the feed, this is a clean no-op for the public site at that point — it just stops querying Google Calendar. The Google Calendar code path (`services/google-calendar.ts`) stays in the repo, dormant, behind the flag.
3. **Retire (later cleanup PR):** once confirmed unused, delete the calendar service, `GOOGLE_API_KEY`/`GOOGLE_CALENDAR_ID` vars, and `parse-description.ts`.

> Until the cutover, **do not** delete the 2 grandfathered events from Google Calendar and **keep `GOOGLE_API_KEY` / `GOOGLE_CALENDAR_ID` set**. The cutover in step 2 is the single, reversible action that ends legacy support — schedule it for after the last grandfathered show date.

`docs/EVENT_CREATION_GUIDE.md` is replaced by a new operator SOP for the form (and `docs/resources/1-SOPS.md` SOP 2 is updated) — but note it must say the **calendar path remains valid for the 2 grandfathered shows** until cutover.

---

## 12. Config & infra summary (what's new)

| Item | Where | New? |
| --- | --- | --- |
| KV namespace `EVENTS` | `worker/wrangler.toml` | **new** |
| R2 bucket `EVENT_IMAGES` | `worker/wrangler.toml` | **new** |
| `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` / `SQUARE_ENVIRONMENT` | Worker secrets/vars + `worker/.dev.vars.example` | **new** |
| `ADMIN_PASSCODE` (generalize `GUESTLIST_PASSCODE`) | Worker secret | renamed |
| `LEGACY_CALENDAR_ENABLED` | Worker var | **new** |
| Admin routes `/admin`, `/admin/events/new`, `/admin/checkin` | frontend `App.tsx` | **new** |

---

## 13. Open decisions (please confirm)

1. **Multi-ticket Square strategy** — recommend **one payment link per ticket type** (matches the working reference, clean per-type Buy buttons). OK, or do you want Catalog items+variations for richer Square reporting?
2. **Image storage** — recommend **Cloudflare R2** (one new bucket). OK to add R2 to the account?
3. **Passcode** — generalize the door passcode into a single `ADMIN_PASSCODE` for the whole admin area, or keep a **separate** passcode for event creation vs. door check-in?
4. **Edit/delete** — MVP supports **create + delete** (no edit; recreate to change). Is delete enough for v0.2, or is in-place edit required?
5. **Orphaned Square links** on partial failure — best-effort deactivate, or accept rare orphans and log them?
6. **Redirect after purchase** — confirm the post-checkout `redirect_url` (default proposal: `https://djkmdlegends.com/?purchase=success`).

---

## 14. Future work (out of scope for v0.2)

- Square **webhook** → auto-build the guestlist roster from purchases (replacing the manual CSV ingest).
- Per-user admin accounts instead of a shared passcode.
- In-place event editing, sold-out/inventory caps, recurring shows.
- Admin "manage shows" list view (the `GET /api/admin/events` endpoint exists for this).
