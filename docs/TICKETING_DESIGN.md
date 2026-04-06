# Ticketing — Design Document

## 1. Goal

When a customer purchases tickets via the Square checkout, generate a verifiable digital ticket, email it with a QR code, and provide a door-scan page for Keith to validate tickets at the venue.

**End-to-end flow:**
1. Customer completes Square payment in the ticket modal
2. Worker creates a ticket record in KV and generates a QR code
3. Confirmation email sent to customer with QR code and ticket details
4. At the venue, Keith opens the scanner page on his phone
5. Keith scans the QR code — page shows ticket validity, guest count, and a "Check In" button
6. Keith taps "Check In" — ticket is marked as used, can't be scanned again

---

## 2. Ticket Data Model

Stored in a Cloudflare KV namespace (`TICKETS`).

**Key:** Random UUID (e.g. `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

**Value:**
```json
{
  "email": "leif@example.com",
  "name": "Leif Taylor",
  "eventTitle": "The Cher Experience",
  "eventDate": "2026-04-15",
  "eventTime": "20:00",
  "quantity": 2,
  "status": "valid",
  "purchasedAt": "2026-04-10T14:30:00Z",
  "checkedInAt": null
}
```

**Status values:**
- `valid` — Purchased, not yet used
- `used` — Checked in at the door
- `refunded` — Payment reversed (future consideration)

One ticket per purchase. If someone buys 3 tickets, they get one QR code with `quantity: 3`. Keith sees "Party of 3" when he scans it.

---

## 3. Architecture

```
Square Payment (success)
  │
  ▼
Worker: POST /api/tickets
  │
  ├─ Generate UUID
  ├─ Store ticket in TICKETS KV
  ├─ Generate QR code (encodes verification URL)
  ├─ Send confirmation email with QR via Mailgun
  │
  ▼
Return { success: true, ticketId }


Keith at the door:
  │
  ▼
Scanner page: /verify
  │
  ├─ Camera scans QR → extracts ticket ID
  ├─ GET /api/tickets/:id → shows ticket details
  ├─ POST /api/tickets/:id/checkin → marks as used
  │
  ▼
"VALID — Party of 2" or "ALREADY USED"
```

---

## 4. QR Code Generation

The QR code encodes a URL:
```
https://djkmdlegends.com/verify?ticket=a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Generation approach:** Use the Google Charts QR API from the worker to generate the QR image. No npm dependencies needed.

```
https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl={encoded-url}
```

Fetch this in the worker, get the image bytes, and inline it in the confirmation email as a base64 `<img>` tag or as a CID attachment.

**Alternative:** Use a lightweight QR library in the worker (e.g. `qrcode-generator` — ~10KB, no dependencies, runs in Workers). This avoids depending on an external service for QR generation. Preferred if the Google Charts API is deprecated or unreliable.

---

## 5. Confirmation Email

Sent via the existing Mailgun integration after ticket creation.

**To:** Customer email
**From:** `DJKMD Legends <tickets@mg.djkmdlegends.com>`
**Reply-To:** `booking@djkmdlegends.com`
**Subject:** `Your Tickets — {eventTitle} — {eventDate}`

**Body:**
- Greeting with customer name
- Event details: title, date, time
- Ticket quantity (e.g. "2 tickets")
- QR code image (centered, prominent)
- Instructions: "Show this QR code at the door"
- Ticket ID for reference
- Contact info fallback

**Design:** Dark/gold branding matching the site, inline styles (same approach as booking confirmation email).

---

## 6. Worker Endpoints

### POST /api/tickets

Called after successful Square payment.

**Request:**
```json
{
  "email": "leif@example.com",
  "name": "Leif Taylor",
  "eventTitle": "The Cher Experience",
  "eventDate": "2026-04-15",
  "eventTime": "20:00",
  "quantity": 2
}
```

**Handler:**
1. Validate payload
2. Generate UUID
3. Store in TICKETS KV with status `valid`
4. Generate QR code
5. Send confirmation email with QR
6. Return `200 { success: true, ticketId }`

### GET /api/tickets/:id

Returns ticket details for the scanner page.

**Response (valid):**
```json
{
  "ticket": {
    "eventTitle": "The Cher Experience",
    "eventDate": "2026-04-15",
    "eventTime": "20:00",
    "name": "Leif Taylor",
    "quantity": 2,
    "status": "valid"
  }
}
```

**Response (not found):**
```json
{ "error": "Ticket not found" }
```

Does not expose email or purchase timestamp to the scanner — only what's needed at the door.

### POST /api/tickets/:id/checkin

Marks a ticket as used.

**Handler:**
1. Read ticket from KV
2. If not found: return `404`
3. If already `used`: return `200 { status: "already_used", checkedInAt }`
4. If `valid`: update status to `used`, set `checkedInAt` to now, return `200 { status: "checked_in" }`

**Idempotent:** Scanning a used ticket doesn't error — it shows "already checked in" with the timestamp.

---

## 7. Scanner Page (Frontend)

A lightweight page at `/verify` (or a route within the SPA).

### Layout

```
┌─────────────────────────────┐
│      DJKMD Legends          │
│      Ticket Scanner         │
│                             │
│   ┌─────────────────────┐   │
│   │                     │   │
│   │   Camera viewfinder │   │
│   │                     │   │
│   └─────────────────────┘   │
│                             │
│   [ Scan Ticket ]           │
│                             │
│   ── After scan ──          │
│                             │
│   ✅ VALID                  │
│   The Cher Experience       │
│   Sat, Apr 15 · 8:00 PM    │
│   Leif Taylor — Party of 2 │
│                             │
│   [ Check In ]              │
│                             │
│   ── After check-in ──      │
│                             │
│   ✅ CHECKED IN             │
│   [ Scan Next ]             │
└─────────────────────────────┘
```

### QR Scanning

Use the browser's `BarcodeDetector` API (supported on Chrome Android, Safari iOS 16.4+). Fallback: use a lightweight JS library like `html5-qrcode` for broader compatibility.

The scanner reads the QR URL, extracts the ticket ID from the query string, and calls `GET /api/tickets/:id`.

### States

1. **Ready** — Camera viewfinder active, waiting for scan
2. **Loading** — Fetching ticket details
3. **Valid** — Green banner, ticket details, "Check In" button
4. **Already Used** — Yellow/orange banner, "Already checked in at {time}"
5. **Invalid** — Red banner, "Ticket not found"
6. **Checked In** — Green confirmation, "Scan Next" button to reset

### Access Control

The scanner page is public (no auth). This is acceptable because:
- Scanning only reveals event name, guest name, and quantity — not sensitive data
- The check-in endpoint is idempotent — scanning twice doesn't cause harm
- Adding auth would require Keith to log in on his phone at the venue, adding friction

If needed later, add a simple PIN gate (e.g. `?pin=1234` in the URL Keith bookmarks).

---

## 8. KV Namespace

Create a new `TICKETS` KV namespace (separate from `MAILING_LIST`).

```bash
npx wrangler kv namespace create TICKETS
npx wrangler kv namespace create TICKETS --preview
```

Add to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "TICKETS"
id = "<production-id>"
preview_id = "<preview-id>"
```

Add `TICKETS: KVNamespace` to the `Env` interface.

---

## 9. Integration with Square Payment

The ticket creation flow is triggered after a successful Square payment. The sequence in the ticket modal:

1. Customer fills in details, clicks "Purchase"
2. Frontend collects card via Square Web Payments SDK
3. Frontend sends payment token to `POST /api/tickets/purchase` (or similar)
4. Worker creates the Square payment via Square API
5. If payment succeeds: worker creates the ticket, generates QR, sends email
6. Worker returns success + ticket ID to frontend
7. Frontend shows confirmation with "Check your email for your tickets"

The exact endpoint design will be finalized in the Square payments implementation. The ticketing system is the post-payment step.

---

## 10. Implementation Steps (High Level)

### Step 1 — Create TICKETS KV namespace
Manual: `wrangler kv namespace create TICKETS`

### Step 2 — Worker: Ticket types and validation
Add `Ticket` type, `TICKETS` KV binding to `Env`, validation for ticket creation payload.

### Step 3 — Worker: QR code generation
Create `worker/src/services/qr.ts` — generates QR code as base64 PNG.

### Step 4 — Worker: Ticket email template
Create `worker/src/templates/ticket-confirmation.ts` — email with QR code and event details.

### Step 5 — Worker: Ticket endpoints
- `POST /api/tickets` — create ticket, generate QR, send email
- `GET /api/tickets/:id` — return ticket details
- `POST /api/tickets/:id/checkin` — mark as used

### Step 6 — Frontend: Scanner page
Create `/verify` route with camera-based QR scanning, ticket display, and check-in button.

### Step 7 — Integration with Square payment flow
Wire ticket creation into the post-payment success handler.

### Step 8 — Local test and deploy

---

## 11. Resolved Decisions

| # | Decision | Resolution |
|---|---|---|
| Q1 | Ticket storage | Cloudflare KV (`TICKETS` namespace) |
| Q2 | QR content | URL to verification page with ticket ID as query param |
| Q3 | QR generation | Lightweight library in worker (no external API dependency) |
| Q4 | One QR per purchase | Yes — quantity encoded in ticket, not separate QRs per guest |
| Q5 | Scanner auth | None for now — public page, add PIN gate later if needed |
| Q6 | Ticket email | Via existing Mailgun integration with inline QR image |
| Q7 | Check-in idempotency | Scanning used ticket shows "already checked in", not an error |
