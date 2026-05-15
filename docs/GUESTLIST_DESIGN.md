# Guestlist — Design Document

## 1. Goal

Give Keith a phone-friendly door page for night-of check-ins. He opens `/guestlist` on his cell, picks the show, scrolls or searches the order list, taps a party, confirms "check in?", and the row turns green. Check-in state is persistent and shared across devices.

**Flow:**
1. Keith opens `djkmdlegends.com/guestlist` on his phone
2. Signs in once with a shared passcode (stored in `localStorage` after)
3. Picks the show date (only May 17 today; dropdown is forward-compatible)
4. Sees the list of orders for that show — name, qty, ticket type
5. Searches by name as guests arrive
6. Taps a row → "Check in {Name}?" modal → confirm
7. Row turns green; state persists on reload and across devices

**Non-goals (MVP):**
- No ticket scanning, no per-individual check-in (a party of 8 checks in as one tap)
- No editing of orders (the CSV is canonical — re-ingest if Square changes)
- No analytics, no export
- No public discoverability — page is unlinked, passcode-gated, `noindex`

---

## 2. Storage: Cloudflare KV (not D1)

D1 is overkill for ~70 immutable rows per show and one mutable bit per row. KV models this naturally with two key shapes in a single new namespace `GUESTLIST`:

| Key | Value | Lifecycle |
|---|---|---|
| `roster:{showId}` | `Party[]` (parsed CSV, JSON) | Written once per show at ingest. Immutable thereafter. |
| `checkin:{showId}:{partyId}` | `{ checkedInAt: ISO8601 }` | Created on check-in. Deleted on uncheck. **Presence is the signal.** |

**Why this shape:**
- One `list({ prefix: 'checkin:{showId}:' })` returns the full check-in set in a single round-trip — that's all the mutable state, the rest is static.
- Roster and check-ins are decoupled: re-ingesting the CSV doesn't clobber check-ins (as long as `partyId` is deterministic).
- No schema, no migrations, no joins. Matches the pattern already established by `MAILING_LIST`.

**Why not D1:** ~70 rows × a handful of shows per year. The query layer would be 100% overhead. KV's eventual consistency is also fine here — Keith is one operator on one device; he won't race himself.

---

## 3. Architecture

```
Browser (/guestlist SPA route)
  │
  │  Authorization: Bearer <passcode>
  │
  ├── GET  /api/guestlist/shows                 → ["2026-05-17", ...]
  ├── GET  /api/guestlist/shows/:id             → { parties: Party[], checkedIn: string[] }
  ├── POST /api/guestlist/shows/:id/checkin     → { partyId }
  └── DEL  /api/guestlist/shows/:id/checkin     → { partyId }
        │
        ▼
   Cloudflare Worker
        │
        ├─ auth: constant-time compare bearer === env.GUESTLIST_PASSCODE
        ├─ KV reads/writes against GUESTLIST namespace
        │
        ▼
   { ok: true, ... }
```

The worker is the only thing that touches KV. The page is gated; PII (email/phone) is returned by the API but only revealed in the check-in modal as a verification aid, not on the list.

---

## 4. Data model

### 4.1 `Party` (one per *person*, aggregated across all their orders)

```ts
interface Purchase {
  variation: 'Show and Meal' | 'Show Only' | 'Unknown';
  quantity: number;
}

interface Party {
  id: string;            // deterministic: sha1(`${showId}|${email.toLowerCase()}`) truncated to 12 chars
  firstName: string;     // split from "Recipient Name" (from earliest order in the group)
  lastName: string;
  email: string;
  phone: string | null;
  quantity: number;      // total across all purchases
  purchases: Purchase[]; // aggregated by variation; sorted Meal+Show → Show Only → Unknown
  orderDate: string;     // earliest order date in the group
}
```

**Grouping rule (ingest):**
- Group rows by `email.toLowerCase()`. Empty-email rows fall back to `noemail|${name}|${orderDate}` so they don't false-merge.
- Within a group, sum quantities per variation (so two `Show and Meal` orders of qty 4 collapse to `{variation: "Show and Meal", quantity: 8}`).
- `id` is keyed off email only, so re-ingesting the same CSV — or an updated CSV with new orders for the same person — keeps the same `partyId` and existing check-ins survive.

If Square later assigns a real order number we should prefer that for tiebreaking edge cases, but email-as-group-key handles the realistic case where one person buys multiple times.

### 4.2 Show ID

`showId` is the **fulfillment date** in `YYYY-MM-DD` (e.g. `2026-05-17`). Today the CSV doesn't carry the show date — it's the filename. Ingest takes `--show-date` as an argument.

### 4.3 Check-in record

```ts
// Key: checkin:2026-05-17:a1b2c3d4e5f6
// Value:
{ checkedInAt: '2026-05-17T19:42:10.000Z' }
```

Optional future fields: `by` (operator), `note`. Not needed for MVP.

---

## 5. Ingest

CSV → KV is a one-shot operation per show, done from a developer's machine. Not in the door-side UI (Keith is non-technical and we don't want him uploading the wrong CSV during a show).

**`tools/ingest-guestlist.mjs`** (new):

```bash
node tools/ingest-guestlist.mjs \
  --csv scratch/orders-may-17-show.csv \
  --show 2026-05-17 \
  [--remote]   # default writes to local KV; --remote writes to production
```

What it does:
1. Parses CSV (RFC 4180 — there are quoted commas in the data)
2. Builds `Party[]` — splits name on last space, normalizes variation, computes `id`
3. Drops rows with no name + no email (defensive)
4. `wrangler kv key put` (via `execa`) writes `roster:{showId}` as a single JSON blob

For MVP one show, a manual `wrangler kv key put --binding GUESTLIST roster:2026-05-17 "$(cat parsed.json)"` is fine too. The script is so the second show isn't a special event.

**Note on the CSV in `scratch/`:** it's PII. Do not commit it. Add `scratch/` to `.gitignore` (it isn't currently) before any of this lands.

---

## 6. Auth

Simplest gate that's appropriate for a low-stakes operator page:

- New worker env var `GUESTLIST_PASSCODE` (Cloudflare secret, not in `wrangler.toml`)
- All `/api/guestlist/*` routes require `Authorization: Bearer <passcode>`
- Constant-time compare (`crypto.timingSafeEqual` on equal-length buffers, or bail to `false` on length mismatch first)
- Frontend has a sign-in screen on `/guestlist`: one password input → POST to `/api/guestlist/shows` with the bearer → on 200, save passcode to `localStorage` and proceed; on 401, show error
- "Sign out" button clears `localStorage`

This is **not** secure against a determined attacker — anyone with the passcode gets all PII for all shows. That matches the threat model (one operator, one phone, low-value PII for a tribute act). If we ever need stronger auth, swap in Cloudflare Access in front of the route.

---

## 7. Frontend

### 7.1 Routing

The site has no router today; `App.tsx` is a single-page composition. We add the minimum:

```tsx
// App.tsx
const path = window.location.pathname;
if (path === '/guestlist') return <Guestlist />;
// ...existing marketing site...
```

No new dependency. Add `/guestlist /index.html 200` to `public/_redirects` so Cloudflare Pages serves the SPA for that path. Add `<meta name="robots" content="noindex">` injected by the `Guestlist` component (via a `useEffect` that sets it).

### 7.2 Component tree

```
src/components/guestlist/
├── Guestlist.tsx              # Top-level; auth gate + show picker + list
├── Guestlist.module.css
├── SignIn.tsx                 # Passcode entry
├── ShowPicker.tsx             # <select> or labeled chip if only one show
├── SearchBar.tsx
├── PartyList.tsx              # Virtualized? Not needed at ~70 rows. Plain map.
├── PartyRow.tsx               # Name · qty · variation · green if checked in
└── CheckInModal.tsx           # "Check in {Name}?" — confirm/cancel, shows email+phone
```

### 7.3 Service

`src/services/guestlist.ts` — thin wrapper around the four endpoints. Reads passcode from `localStorage`, attaches `Authorization` header. Returns typed responses.

### 7.4 Search

Case-insensitive substring match on `${firstName} ${lastName}`. No fuzzy matcher needed at this scale — 70 rows, debounce-free, runs on every keystroke in <1ms. If it ever grows, swap in `fuse.js`.

### 7.5 Check-in interaction

- Tap a row → `CheckInModal` opens with the party's details (name, qty, variation, **email, phone** — these are the verification fields)
- Confirm → optimistic UI: row immediately turns green, modal closes. POST `/checkin` in background.
- If POST fails: revert green, toast "Failed to check in — try again."
- Already-checked-in row, when tapped: modal says "Already checked in at 7:42 PM. Undo?" → Undo issues DELETE.

### 7.6 Visual

- Mobile-first. Single column, large tap targets (min 44px tall rows).
- Row layout: `[Name (bold)]  [qty × variation (right-aligned chip)]`
- Checked-in row: green-tinted background, name has a checkmark prefix.
- Sticky header: show picker + search bar.
- No marketing-site chrome (no Header/Footer). This is a tool, not a page.

---

## 8. API contracts

All endpoints return `application/json`. All require `Authorization: Bearer <passcode>` except `OPTIONS`. CORS reuses the existing allowlist logic.

### `GET /api/guestlist/shows`

```json
{ "shows": ["2026-05-17"] }
```

Implemented as `env.GUESTLIST.list({ prefix: 'roster:' })` → strip prefix from each key.

### `GET /api/guestlist/shows/:showId`

```json
{
  "parties": [
    { "id": "a1b2c3", "firstName": "Jennifer", "lastName": "Saber",
      "email": "jen@saber1.com", "phone": "+19788730069",
      "quantity": 2, "variation": "Show and Meal", "orderDate": "2026/04/30" },
    ...
  ],
  "checkedIn": {
    "a1b2c3": "2026-05-17T19:42:10.000Z"
  }
}
```

Two KV reads: `get('roster:{id}')` and `list({ prefix: 'checkin:{id}:' })`. Both can run in parallel with `Promise.all`.

404 if the roster key doesn't exist.

### `POST /api/guestlist/shows/:showId/checkin`

Body: `{ "partyId": "a1b2c3" }`

Validates the partyId exists in the roster (guard against typos / stale clients). Writes `checkin:{showId}:{partyId}` with `{ checkedInAt: now }`. Idempotent — re-checking-in is a no-op write.

### `DELETE /api/guestlist/shows/:showId/checkin`

Body: `{ "partyId": "a1b2c3" }`. Deletes the key. Idempotent.

---

## 9. Requirements

### Functional

| # | Requirement |
|---|---|
| F1 | `/guestlist` route renders a passcode sign-in if no token in localStorage |
| F2 | After sign-in, user picks a show (auto-selects if only one) |
| F3 | List shows first/last name, qty, ticket variation, sorted alphabetically by last name |
| F4 | Search filters the list live by case-insensitive substring on full name |
| F5 | Tapping a row opens a check-in modal with verification details (email, phone) |
| F6 | Confirming check-in turns the row green and persists across reload |
| F7 | Tapping an already-checked-in row offers an undo |
| F8 | Check-in state is shared across devices (Keith opens a backup phone — same state) |

### Non-Functional

| # | Requirement |
|---|---|
| NF1 | Page works on a small phone (375px wide) without horizontal scroll |
| NF2 | First useful paint within 2s on 4G after sign-in |
| NF3 | All endpoints reject unauthenticated requests with 401 |
| NF4 | Page is `noindex`; not linked from the marketing site |
| NF5 | PII (email, phone) is not logged by the worker |
| NF6 | Re-ingesting the same CSV does not orphan existing check-ins |

---

## 10. Implementation steps

### Step 1 — KV namespace + secret

- `wrangler kv namespace create GUESTLIST` (+ `--preview`)
- Add binding to `worker/wrangler.toml`
- `wrangler secret put GUESTLIST_PASSCODE`
- Add `GUESTLIST: KVNamespace` and `GUESTLIST_PASSCODE: string` to `Env` in `worker/src/types.ts`

### Step 2 — Worker auth helper + routes

- Add `requireAuth(request, env): Response | null` returning a 401 response or null
- Wire four `/api/guestlist/*` routes in `worker/src/index.ts`
- Validation lives in `worker/src/validation.ts` alongside the existing parsers

### Step 3 — Ingest script

- `tools/ingest-guestlist.mjs` — parse, normalize, write `roster:{showId}` via `wrangler kv key put`
- Add `scratch/` to `.gitignore`
- Run it once for May 17

### Step 4 — Frontend route + sign-in

- Conditional render in `App.tsx` for `/guestlist`
- `Guestlist` component with `SignIn` sub-state
- `_redirects` entry for SPA fallback

### Step 5 — Frontend list + search + check-in

- `src/services/guestlist.ts`
- `PartyList`, `PartyRow`, `SearchBar`, `CheckInModal`
- Optimistic check-in with rollback

### Step 6 — Smoke test

- `docker compose up`, hit `/guestlist`, sign in with local passcode
- Verify list renders, search filters, check-in persists across hard reload
- Verify second tab on another device reflects check-ins (will require deploying to a preview URL or both clients hitting the local worker over LAN)

---

## 11. Open questions

| # | Question | Default if not answered |
|---|---|---|
| Q1 | Should partial check-ins be possible (e.g. 6 of 8 in the party arrived)? | No for MVP. Add a `checkedInCount` field later if needed. |
| Q2 | Who else needs the passcode? Anyone besides Keith? | Just Keith. One shared passcode is fine. |
| Q3 | Should the ingest script live in `tools/` (Node) or `worker/` (wrangler-side)? | `tools/` — it's a dev workflow, not a worker concern. |
| Q4 | Do we want a "walk-up" entry path for people who paid at the door? | Out of scope for MVP. Add via the same KV pattern later. |
| Q5 | Backup if KV is down on show night? | Frontend can fall back to a downloaded JSON snapshot of the roster — but check-in state would be local-only until KV is back. Not building unless requested. |

---

## 12. Resolved decisions

| # | Decision | Resolution |
|---|---|---|
| D1 | Storage | KV (`GUESTLIST` namespace), two key shapes: `roster:*` and `checkin:*` |
| D2 | Roster ingest | Local Node script in `tools/`, not in-browser upload |
| D3 | Auth | Shared passcode via Bearer token; stored in `localStorage` after sign-in |
| D4 | Routing | Conditional render in `App.tsx`; no router dependency added |
| D5 | Unit of check-in | Order (party), not individual ticket |
| D6 | `partyId` | Deterministic hash of `showId + email + orderDate` so re-ingest is safe |
| D7 | PII handling | Returned by API behind auth; visible only in check-in modal, not list view |
