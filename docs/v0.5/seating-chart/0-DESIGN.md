# v0.5 — Seating Charts · DESIGN

**Status:** Proposed (LGD epic, 2026-09-08). Companion: `1-IMPLEMENTATION.md`.
**Builds on:** v0.2 event form (KV event records, on-demand Square links), v0.3 capacity + event-scoped check-in, v0.4 admin PWA.
**Lands in the repo as:** `docs/v0.5/seating-chart/0-DESIGN.md` + `1-IMPLEMENTATION.md` (P0).

## 1. Goal

Let Keith sell **reserved seats** instead of general admission.

- In the **Legends Admin** PWA, build a named seating layout once per venue ("Venue 1 Seating"): drag round tables, rectangular tables, rows of seats and the stage onto a floor plan; set how many seats each has; save as many layouts as there are venues.
- When creating or editing a show, **attach a layout**. The show's capacity becomes the layout's seat count.
- On the public site, a buyer picks a ticket type and quantity as today, then **taps the seats they want** on the same floor plan, and only then goes to Square to pay. Their seats are recorded on their guest-list party.
- At the door, **Door Check-in** gains a chart toggle showing which seats are sold and which parties have arrived, refreshing as people are checked in. Tapping a seat checks in its party. **Manage Shows** gets the same view behind a **Seating chart** button next to Edit / Mark sold out / Delete.

Shows **without** a layout keep today's general-admission behaviour exactly. The two grandfathered Google Calendar shows cannot carry a layout.

### Non-goals (v0.5)

- **No seat-based pricing.** Price stays on the ticket type; a seat is a position, not a price tier. (Open for v0.6: per-object "section" tags that restrict which ticket types may sit there, which is how a "VIP front tables" tier would be done without changing the money path.)
- **No per-individual check-in.** A party still checks in as one tap; all of its seats flip together.
- **No Legends MCP server.** None exists today; the admin HTTP API is the integration surface. An MCP wrapper is a separate future deliverable if agent-driven show management is ever wanted.
- **No editing a layout that a selling show has snapshotted** (see §5.3). Duplicate-and-edit instead.
- **No auto-layout / floor-plan image import.** Objects are placed by hand on a blank grid.

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| **Rendering** | Hand-rolled **inline SVG + Pointer Events**, one shared module used by the editor, the buyer's picker and the occupancy view. **No new runtime dependency.** | The whole project has one runtime dependency (`qrcode-generator`). A floor plan is ~10–40 objects and ≤ 300 seats; SVG handles that trivially, scales crisply on phones, and the same `<SeatMap>` component serves all three surfaces with a `mode` prop. dnd-kit / konva / fabric would add 100–300 KB and a second mental model for what is, at bottom, `pointerdown → pointermove → pointerup` on a `viewBox`. |
| **Where shared code lives** | New top-level **`shared/seating/`** (types, geometry, seat-id rules, validation), imported by `src/`, `admin/` **and** `worker/` via a `@seating/*` alias. | Three separate Vite/wrangler builds need the *same* seat-id derivation and layout validation; duplicating it is how the site and worker drift. A relative-path folder is the smallest thing that works (no workspaces, no publish step). |
| **Layout storage** | KV `EVENTS`, key **`chart:<id>`** = one JSON document per layout. | A layout is a small immutable-ish document read whole; that is KV's sweet spot and matches `event:<id>`. |
| **Seat state storage** | **Cloudflare D1** database `legends-seating` (tables `seats`, `seat_holds`). **First non-KV store in the project.** | The buyer holds seats for the minutes it takes Square to collect payment, and two buyers *will* want the same front table on release night. That needs an **atomic conditional claim** ("mark these N seats held only if all N are free") and a way to expire holds. KV is eventually consistent with last-write-wins; it cannot express that (the existing `sold` counter already documents an accepted race — `index.ts:494-505`). D1 gives `UPDATE … WHERE status='available'` with a row count, atomic `batch()`, and plain SQL to inspect at 2 a.m. A Durable Object would also work but adds a new class, migrations and a second programming model for one show's worth of rows; D1 is already used across the account (kbrelay, chopinly, tricorder) and by this team. |
| **Hold expiry** | **Lazy.** A hold has `expires_at`; every read and every claim treats an expired hold as free. No cron, no alarm. | Zero moving parts. Expired rows are reclaimed on the next touch; a nightly sweep is optional hygiene, not correctness. |
| **Snapshot on attach** | Attaching a layout to a show **copies the layout into the event record** (`seating.layout`) and materializes its seats into D1. Later edits to the master layout do not touch the show. | A show that has sold seats must render exactly what buyers bought. Snapshots make that a non-problem; "re-sync" is only allowed while `sold = 0`. |
| **Correlating a Square payment with a hold** | The hold stores the **`orderId`** Square returns when the payment link is minted; the webhook looks the hold up by `payment.order_id`. The `payment_note` format is **unchanged**. | The existing webhook already receives `order_id` and the minted link already returns it (`CachedLink.squareOrderId`). No note-format change, no regex risk on ticket types containing colons. Verified with a sandbox purchase in P3 before anything else in that phase (fallback: append `:h=<holdId>` to the note). |
| **Capacity semantics** | A show with seating has `capacity = seatCount`, enforced; the capacity field is disabled in the forms. `sold` keeps counting tickets exactly as today. | One source of truth; the existing capacity meter, sold-out flip and link-cache clearing keep working untouched. |
| **Public availability endpoint** | New **`GET /api/events/:id/seating`** with `Cache-Control: no-store`. `GET /api/events` only gains a `seating: { seatCount }` flag. | `/api/events` is cached 60 s (`index.ts:130-165`); live seat availability must not be. |
| **Real-time at the door** | **Polling** every 8 s while a chart view is visible (`document.visibilityState`), same payload the roster already fetches. | The admin app has no push channel and the design doc for v0.4 rejected a caching SW for the same reason: the door needs fresh truth, not clever infra. One extra `no-store` GET every 8 s from one or two phones is nothing. |
| **Auth** | Unchanged: shared admin passcode for all `/api/admin/*` chart and seat endpoints; public hold/checkout endpoints are unauthenticated like today's checkout, rate-limited by the same CORS allow-list and validation. | Out of scope to change the auth model. |

## 3. Shape

```
admin.djkmdlegends.com (Pages: legends-admin)             djkmdlegends.com (Pages: legends-website)
  /charts            Seating Charts — list                  TicketModal
  /charts/new        Editor (new)                             ticket type + qty  →  SeatPicker  →  Square
  /charts/:id        Editor (edit)                                (mode="pick", hold countdown)
  /events/new        Create a Show  + "Seating chart" picker
  /events            Manage Shows   + [Seating chart] button → SeatMap (mode="view") modal
  /checkin           Door Check-in  + List | Chart toggle   → SeatMap (mode="view", tap seat → CheckInModal)
        │                                                         │
        └──────────────── legends-booking-worker (one Worker, three routes) ─────────────────┘
                 KV EVENTS   chart:<id>  event:<id>{…, seating}      R2  EVENT_IMAGES
                 KV GUESTLIST party:<eventId>:<paymentId>{…, seats}  D1  legends-seating (seats, seat_holds)
                 Square: payment links (unchanged) · webhook → confirm hold → party.seats

shared/seating/   types.ts · geometry.ts · ids.ts · validate.ts   ← imported by all three builds
```

## 4. Data model

### 4.1 Layout — `SeatingChart` (KV `EVENTS`, key `chart:<id>`)

```jsonc
{
  "id": "c_7f3a9b2e",                 // "c_" + 8 hex, server-assigned
  "name": "Venue 1 Seating",          // unique per tenant, case-insensitive, 1–60 chars
  "version": 1,                        // schema version of this document
  "revision": 4,                       // bumps on every PUT; used for optimistic concurrency
  "canvas": { "width": 1200, "height": 800 },   // abstract units; 1 unit ≈ 1 cm is the mental model
  "objects": [
    { "id": "o_1", "kind": "stage",  "x": 400, "y": 20,  "width": 400, "height": 80, "rotation": 0, "label": "Stage" },
    { "id": "o_2", "kind": "round",  "x": 300, "y": 300, "radius": 60, "seats": 8,  "label": "T1", "rotation": 0 },
    { "id": "o_3", "kind": "rect",   "x": 700, "y": 300, "width": 160, "height": 80, "seats": 6, "label": "T2", "rotation": 0 },
    { "id": "o_4", "kind": "row",    "x": 200, "y": 650, "seats": 12, "pitch": 40, "label": "A", "rotation": 0 }
  ],
  "createdAt": "2026-09-08T14:00:00.000Z",
  "updatedAt": "2026-09-08T15:12:00.000Z"
}
```

Object kinds and their seat rules (all geometry is pure and lives in `shared/seating/geometry.ts`):

| kind | Fields | Seats | Seat label |
| --- | --- | --- | --- |
| `stage` | `x, y, width, height, rotation, label` | none | — |
| `round` | `x, y` (centre), `radius`, `seats` (1–20), `label`, `rotation` | evenly spaced on a ring at `radius + 22`, starting at `rotation` | `T1-1 … T1-8` |
| `rect` | `x, y` (top-left), `width, height`, `seats` (1–24), `label`, `rotation` | split across the two long sides (odd → extra on the top side) | `T2-1 … T2-6` |
| `row` | `x, y` (first seat centre), `seats` (1–40), `pitch` (seat spacing), `label`, `rotation` | a straight line of `seats` seats | `A1 … A12` |

**Seat identity.** A seat's stable id is `<objectId>.<n>` (1-based), e.g. `o_2.3`. Its human label is derived from the object label as above. Ids are what the database and the party record store; labels are what people see and what prints on the door sheet. Renaming a table changes labels, never ids. Deleting an object deletes its seats (and is refused if the layout has sold seats via a snapshot — moot, because snapshots are copies).

**Validation** (`shared/seating/validate.ts`, run on PUT and again on attach): unique object ids; label pattern `^[A-Za-z0-9 \-]{1,12}$`; unique labels within the layout; numeric ranges above; at most 1 stage; at most 80 objects and 400 seats; every object inside the canvas.

### 4.2 Event record additions (KV `EVENTS`, key `event:<id>`)

```jsonc
{
  // …existing EventRecord fields unchanged…
  "capacity": 96,                      // == seating.seatCount while seating is attached
  "seating": {                         // absent = general admission (today's behaviour)
    "chartId": "c_7f3a9b2e",
    "chartName": "Venue 1 Seating",
    "chartRevision": 4,
    "seatCount": 96,
    "attachedAt": "2026-09-08T15:20:00.000Z",
    "layout": { /* full SeatingChart snapshot as of attach */ }
  }
}
```

### 4.3 Party record additions (KV `GUESTLIST`, key `party:<eventId>:<paymentId>`)

```jsonc
{
  // …existing PartyRecord fields unchanged…
  "seats": ["o_2.3", "o_2.4"],         // seat ids confirmed for this party
  "seatStatus": "assigned"             // "assigned" | "partial" | "unassigned" | absent (GA show)
}
```

`partial` / `unassigned` only happen when a buyer paid after their hold expired and someone else took the seats (§6.4). They are surfaced in Manage Shows and Door Check-in with an **Assign seats** affordance.

### 4.4 D1 `legends-seating`

```sql
CREATE TABLE seats (
  show_id         TEXT NOT NULL,          -- event id
  seat_id         TEXT NOT NULL,          -- "<objectId>.<n>"
  label           TEXT NOT NULL,          -- "T1-3"
  object_id       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'available',  -- available | held | sold
  hold_id         TEXT,                   -- while held
  hold_expires_at INTEGER,                -- epoch ms, while held
  party_key       TEXT,                   -- "party:<eventId>:<paymentId>" once sold
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (show_id, seat_id)
);
CREATE INDEX seats_show_status ON seats (show_id, status);
CREATE INDEX seats_hold ON seats (hold_id);

CREATE TABLE seat_holds (
  id               TEXT PRIMARY KEY,      -- "h_" + 12 hex
  show_id          TEXT NOT NULL,
  seat_ids         TEXT NOT NULL,         -- JSON array
  ticket_type      TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',  -- active | converted | released | superseded
  expires_at       INTEGER NOT NULL,      -- epoch ms
  square_order_id  TEXT,                  -- set when the payment link is minted
  square_link_id   TEXT,
  party_key        TEXT,                  -- set on conversion
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX holds_order ON seat_holds (square_order_id);
CREATE INDEX holds_show_status ON seat_holds (show_id, status);
```

Rows per show = seat count (≤ 400). Every id list in an `IN (…)` is chunked at 90 binds (D1's 100-parameter cap, see claude_ops memory).

## 5. Admin: Seating Charts editor

### 5.1 Navigation

New menu card **Seating Charts** on the admin home grid, between Manage Shows and Door Check-in. Routes `/charts` (list), `/charts/new`, `/charts/:id` — added to the hand-rolled router in `admin/src/app/App.tsx` exactly like `/sales` was.

### 5.2 List page

A card per layout: name, seat count, object summary ("6 round · 2 rect · 1 row · stage"), last edited, and **Used by** (upcoming shows that snapshotted it, by name). Actions: **Edit**, **Duplicate** (creates "Copy of …"), **Delete** (ConfirmModal; refused with an explanation when an *upcoming* show references it — past shows do not block, they hold their own snapshot). Primary button **New seating chart**.

### 5.3 Editor — look and feel

The editor is a full-height page (header → toolbar → canvas → inspector) tuned for a phone in portrait first, and comfortable on a laptop.

- **Header**: name field (inline, placeholder "Venue 1 Seating"), live **"96 seats"** counter, **Save** (primary) and **← Charts**. Unsaved changes prompt on leave.
- **Palette strip** (horizontal, under the header): four chips — **Round table**, **Rect table**, **Seat row**, **Stage**. Tapping a chip **drops the object at the centre of the current view** (one-tap add beats drag-from-palette on a phone); on a laptop the chips are also draggable onto the canvas. The stage chip is disabled once a stage exists.
- **Canvas**: an SVG with a subtle 20-unit dot grid, brand background, gilt outline. Objects render as the venue would see them from above: round tables as a disc with seat circles around the rim, rect tables as a rounded rectangle with seats along the long sides, rows as a line of seat circles, the stage as a wide gold-bordered rectangle labelled "STAGE". Labels sit in the middle of tables and at the head of rows; seat numbers appear inside seats at zoom ≥ 1.5×.
  - **Move**: press and drag any object. Snaps to the grid. The selected object gets a gold halo and four handles.
  - **Rotate**: a handle above the object; drag around; snaps every 15°.
  - **Resize**: corner handles on rect tables and the stage; the ring handle on round tables changes the radius.
  - **Pan / zoom**: two-finger drag / pinch on touch, wheel + drag-on-empty on desktop. **Fit** button re-centres. The viewBox is the only transform, so every hit test is one matrix inverse.
  - **Select / multi-select**: tap to select; long-press (450 ms) or shift-click to add to a selection; drag on empty canvas draws a marquee on desktop. Multi-selection moves as a group.
- **Inspector** (bottom sheet on phone, right rail on laptop) for the selection: **Label**, **Seats** (stepper, live re-layout of seat circles), **Rotation**, size fields, **Duplicate**, **Delete**. When nothing is selected the sheet shows the chart summary and canvas size.
- **Undo / Redo** (in-memory history of layout snapshots, 50 deep; ⌘Z / ⌘⇧Z on desktop, buttons on phone).
- **Auto-labels**: new tables are `T<n>` with the next free number; new rows `A, B, C…`. Editing a label live-updates the seat labels underneath.
- **Save**: `PUT /api/admin/charts/:id` with the `revision` the editor loaded; a 409 (someone else saved) offers **Reload**. Validation errors (§4.1) show inline and block save.

The editor never talks to D1; it edits a JSON document. Everything it needs to draw is `geometry.ts`: `seatPositions(object) → { id, label, x, y }[]`, `objectBounds(object)`, `hitTest(layout, point)`.

### 5.4 Component tree (admin)

```
Charts/ChartsList.tsx            list + duplicate/delete
Charts/ChartEditor.tsx           page shell: header, palette, canvas, inspector, history
Charts/editor/useEditorState.ts  reducer: layout, selection, history, dirty flag
Charts/editor/useCanvasGestures.ts  pointer/touch → move/rotate/resize/pan/zoom/marquee
Charts/editor/Palette.tsx, Inspector.tsx, Handles.tsx
shared/seating/SeatMap.tsx       the renderer (mode: "edit" | "pick" | "view")
```

`SeatMap` is the one component all three surfaces use. In `edit` mode it renders handles and forwards gestures; in `pick` mode it renders seat states and emits `onSeatTap`; in `view` mode it renders states and emits `onSeatTap` for check-in. It is copied verbatim into `src/` and `admin/` by the alias, not duplicated.

## 6. Buyer: seats chosen for the party (revised 2026-09-09 after the design conversation)

**Principle (Leif's call):** the audience is older, on phones, and should never have to pick individual seats. The system picks the party's seats, holds them, shows a reassuring picture, and offers one easy escape hatch — change *table*, not seat. Lowest possible resistance; customisation only for the particular.

### 6.1 Flow

1. **Order Tickets → quantity → Buy**, exactly as today. A show **without** a chart goes straight to Square as before — nothing changes for general admission.
2. A show **with** a chart opens a second sheet in the same modal. On open the site calls `POST /api/events/:id/seats/hold { ticketType, quantity }`; the worker **chooses the seats and holds them in one atomic step** from live D1 availability. The buyer is never shown seats anyone else can take.
3. The sheet reads **"We've saved seats for your party together at Table 3"** (or "…at Tables 3 and 4, right beside each other" when a split was unavoidable), with a small diagram: the party's seats lit gold, everything else dimmed, the stage drawn for orientation, auto-zoomed to their table with the stage in frame. Under it, quietly: "Held for you for 10 minutes."
4. **Looks good, continue** → `POST /api/events/:id/checkout { ticketType, quantity, holdId }` → full-page redirect to Square, unchanged. The Square line item reads `General × 2 · Table 3, seats 3–4 · Sat Oct 4 7:00 PM · Venue`, so the email receipt tells them where they sit.
5. **Change table** → the sheet lists only the tables (and rows) that can seat the whole party side by side: "Table 5 · nearest the stage · 6 free". Tapping one (in the list or on the map) calls `hold` again with `objectId` and `replaceHoldId`; the worker releases the old hold and claims the new seats in one request; the diagram updates. Individual seats are never selectable.
6. Closing the sheet calls `DELETE /api/events/:id/seats/hold/:holdId` (best effort, `keepalive`). If the hold lapses while the sheet is still open, the site re-holds silently and only tells the buyer if the table changed.
7. If no table fits and no split is possible ("no seats left for a party of 6"), the sheet says so and offers a smaller quantity.

### 6.2 Assignment rule (`shared/seating/assign.ts`, unit-tested; reused by P5 admin reassignment)

1. **Together first.** Find every object (table or row — rows count as tables) with a run of `quantity` free seats side by side (consecutive seat numbers; round tables wrap).
2. **Nearest the stage, without stranding a single seat.** Among fits, skip any object where placing the party would leave exactly one free seat behind (if another fit avoids it), then take the smallest distance from the object's centre to the stage's centre (canvas top if no stage), then the tighter fit. Within the object, prefer the run whose leftover free seats stay contiguous. (Revised 2026-09-09 after Leif's review: an early party in an empty room gets a front table, not the smallest one at the back.)
3. **Split only when necessary.** If nothing fits, take the largest run available, then fill from the nearest objects by centre distance, fewest pieces first (a party of 6 → 4 + 2 at neighbouring tables). The sheet always says when a party is split.
4. `objectId` (Change table) restricts step 1 to that object; 409 if it cannot seat the party.

### 6.3 Hold rules

- **TTL 12 minutes** from the hold's creation (the sheet opening). The checkout POST extends it to `now + 12 min` so the clock restarts when the buyer lands on Square. The buyer sees the conservative "10 minutes".
- One hold = exactly `quantity` seats of one ticket type. Two ticket types = two checkouts, as today.
- Holds are anonymous; the `holdId` in the browser is the capability. Replacing a hold (Change table) releases the old one in the same request.
- Expired holds are treated as free by every read and claim (lazy expiry — no cron).

### 6.4 Claim (the only place concurrency matters)

```sql
-- inside one D1 batch, in this order
UPDATE seats SET status='held', hold_id=?1, hold_expires_at=?2, updated_at=?3
 WHERE show_id=?4 AND seat_id IN (…)
   AND (status='available' OR (status='held' AND hold_expires_at < ?3));
-- read meta.changes; if changes != seatIds.length:
UPDATE seats SET status='available', hold_id=NULL, hold_expires_at=NULL WHERE hold_id=?1;   -- compensate
-- then re-read availability and choose again (up to 3 attempts) before answering 409
```

Because the server chooses from a fresh read and retries on a lost race, two buyers opening the sheet at the same moment simply get different tables. A hold that takes over an *expired* hold's seats marks the old hold `superseded` and, best effort, deactivates its Square payment link.

### 6.5 Confirmation (webhook)

`processCompletedPayment` gains one step after the party record is built: look up the hold by `payment.order_id` (proven in sandbox 2026-09-09: the Payment's `order_id` is the payment link's `order_id`, and that order carries our `payment_note`). If found: `UPDATE seats SET status='sold', party_key=?, hold_id=NULL WHERE show_id=? AND seat_id IN (…) AND (hold_id=? OR status='available')`; whatever count comes back is written to `party.seats` (+ `seatLabels`); `seatStatus` is `assigned` when all were won, `partial` when some, `unassigned` when none (or when no hold was found, e.g. a payment on a stale link). The hold becomes `converted`. `sold` increments exactly as today. Nothing here can lose a payment; the worst case is a paid party without seats, which staff resolve from the chart view (§8).

## 7. Show ↔ chart association

- **Create a Show** and **Edit** gain a **Seating chart** select ("General admission (no chart)" + every layout by name with seat count). Choosing one disables the Capacity field and shows "Capacity = 96 seats from *Venue 1 Seating*".
- Server side (`PATCH /api/admin/events/:id` / create): `seatingChartId` is added to the allow-lists in `validation.ts`. On attach the worker snapshots the layout into `event.seating`, sets `capacity`, and materializes seat rows in D1 (`INSERT OR IGNORE`, chunked). On detach or change with `sold = 0` it deletes the show's seat rows and clears `seating`; with `sold > 0` it returns **409** ("This show has sold N seats; seating cannot be changed").
- **Re-sync from layout** (Manage Shows, only while `sold = 0`): re-snapshot the current master layout after edits.
- Manage Shows card shows a **"Reserved seating · Venue 1 Seating · 96 seats"** pill, and the capacity meter reads seats.
- `GET /api/events` exposes `seating: { seatCount }` so the site can decide whether to show the picker; the layout itself comes from the no-store endpoint.

## 8. Live occupancy view (door + manage)

`SeatMap mode="view"` fed by `GET /api/admin/events/:id/guests`, which gains `seating: { layout, seats: { [seatId]: { status, partyId? } } }` and per-party `seats`. Colours: available (outline), sold (gold fill), **checked in** (green fill), held (hatched, admin only), needs-seats parties listed in a banner above the chart.

- **Door Check-in**: a segmented **List | Chart** toggle in the roster header (persisted in `localStorage`). In Chart mode: tap a seat → its party's existing `CheckInModal` (the modal gains a **Seats: T1-3, T1-4** line in both modes). Stats row gains **"41 / 96 seats arrived"**. Polls every 8 s while visible; check-ins remain optimistic and the next poll reconciles. The print sheet gains a Seats column.
- **Manage Shows**: new **Seating chart** button (ghost, between Mark sold out and Delete) opens a modal with the same view plus counts, an **Unassigned parties** list with **Assign seats** (§8.1), and **Re-sync from layout** when `sold = 0`.

### 8.1 Admin seat assignment

`PUT /api/admin/events/:id/parties/:paymentId/seats { seatIds }` — replaces the party's seats atomically (release old, claim new only if available, 409 otherwise). Used for the rare `partial`/`unassigned` party and for a phone-call "can you move us to table 4". Also available from the Chart view in Door Check-in via the party modal.

## 9. API contracts (delta)

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/admin/charts` | admin | list `{ charts: [{ id, name, seatCount, objectSummary, updatedAt, usedBy: [{eventId, showName, startTime}] }] }` |
| `POST /api/admin/charts` | admin | create `{ name, canvas, objects }` → `SeatingChart` |
| `GET /api/admin/charts/:id` | admin | full document |
| `PUT /api/admin/charts/:id` | admin | replace; body carries `revision`; 409 on mismatch; 400 with `details.errors[]` on validation |
| `POST /api/admin/charts/:id/duplicate` | admin | copy with name "Copy of …" |
| `DELETE /api/admin/charts/:id` | admin | 409 if referenced by an upcoming show |
| `PATCH /api/admin/events/:id` | admin | **+ `seatingChartId: string | null`** (and create) |
| `POST /api/admin/events/:id/seating/resync` | admin | re-snapshot; 409 if `sold > 0` |
| `GET /api/admin/events/:id/guests` | admin | **+ `seating`**, parties **+ `seats`, `seatStatus`** |
| `PUT /api/admin/events/:id/parties/:paymentId/seats` | admin | assign/replace seats |
| `GET /api/events` | public | events **+ `seating: { seatCount }`** when attached |
| `GET /api/events/:id/seating?quantity=N` | public, no-store | `{ layout, seats: { [seatId]: "available" \| "taken" }, tables: [{ objectId, label, kind, free, fits }] }` — `fits` = can seat N side by side |
| `POST /api/events/:id/seats/hold` | public | `{ ticketType, quantity, objectId?, replaceHoldId? }` → `{ holdId, expiresAt, seatIds, seatLabels, objects: [{ id, label }], split, message }`; 409 when nothing fits |
| `DELETE /api/events/:id/seats/hold/:holdId` | public | release (idempotent) |
| `POST /api/events/:id/checkout` | public | **+ `holdId`** (required when the show has seating; 409 if expired) |

Errors follow the existing `{ error, details? }` + status convention.

## 10. Requirements

**Functional**
- Build, save, duplicate, delete named layouts with round/rect tables, rows and a stage; seat counts per object; multiple layouts.
- Attach a layout to a show at create or edit; capacity derives from it; GA shows unchanged.
- The server chooses and holds exactly `quantity` seats for the buyer before Square (together at one table when possible); the buyer can only change table; seats are confirmed by the webhook; two buyers cannot buy the same seat.
- Party records carry seats; check-in modal, print sheet and sales buyer drill-down show them.
- Door Check-in chart toggle with live refresh and tap-to-check-in; Manage Shows chart button with the same view; admin can assign/reassign seats.

**Non-functional**
- Zero new runtime dependencies in the site and admin bundles; the site bundle grows by < 25 KB gzipped (renderer + picker).
- Editor usable on a 390 px phone with one hand; the buyer sheet needs no gesture beyond two buttons and a list.
- Hold claim is atomic under concurrent requests (verified with a 20-way parallel `curl` in P3).
- No change to Square money flow, the payment note, or the webhook signature path.
- All new admin endpoints behind the existing passcode; all public endpoints validate ids with the existing regexes.

## 11. Open questions (answered here so the epic can start)

| Question | Answer |
| --- | --- |
| Seat-based pricing? | **No** for v0.5; pricing stays on ticket type. Sections restricting ticket types are the v0.6 path. |
| MCP for shows/seating? | **Deferred.** No Legends MCP exists; the admin API is the surface. |
| KV vs D1 vs Durable Object for seats? | **D1** (see §2). |
| What if a buyer pays after the hold expired? | Webhook assigns what it still can and flags the party `partial`/`unassigned`; the admin assigns seats from the chart view. Never lose the payment. |
| Can a layout change after shows use it? | Yes; shows keep their snapshot. Re-sync only while `sold = 0`. |
| Legacy calendar shows? | Cannot attach seating (no event record). They retire ~Sept 2026 anyway. |

## 12. Risks

- **`order_id` correlation** between the minted link and the webhook is assumed from `CachedLink.squareOrderId` and `payment.order_id`; P3 starts with a sandbox purchase proving it (fallback: `:h=<holdId>` note suffix).
- **Worker deploy token scope**: `legends_cloudflare_token` has no D1 scope (verified 2026-09-08); the D1 database is created with the shared account token and the deploy step must be verified once the binding exists (P0).
- **Bundle discipline**: one `SeatMap` shared by three builds is only a win if the alias is set up once, correctly, in all three tsconfigs and Vite configs (P0 acceptance).
- **Touch gesture conflicts** on iOS (pinch vs. page zoom, long-press context menus): `touch-action: none` on the SVG and `user-select: none`; remember the claude_ops lesson that `pointerleave` fires before `click` on touch and must not cancel a tap.
