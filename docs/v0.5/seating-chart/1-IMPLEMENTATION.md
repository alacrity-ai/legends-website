# v0.5 — Seating Charts · IMPLEMENTATION

**Status:** Proposed (LGD epic, 2026-09-08). Design: `0-DESIGN.md` (read it first; decisions there are locked unless Leif reopens them).
**Repo:** `~/lets-get-rich/legends/legends-website` (persona `leifktaylor`). Branch per phase off `main`: `LGD-<n>-seating-p<k>`; PR per phase; each phase is independently deployable and leaves GA shows untouched.

## How to use this document

Six phases map 1:1 to the child cards of the epic. Each phase lists **files**, **steps**, **acceptance criteria** and **verification**. Do them in order; P0 is a prerequisite for everything, P1 and P2 can overlap, P3 depends on P2, P4 depends on P2 (and shows held seats only after P3), P5 depends on P3+P4.

Conventions that already hold in this repo and apply to every phase:
- CSS Modules + tokens only (`admin/src/styles/tokens.css`, identical to `src/styles/tokens.css`); no UI library, no icon library, Unicode glyphs or inline SVG.
- Worker: hand-rolled routing in `worker/src/index.ts`, `jsonResponse`, `getCorsHeaders`, `isAuthorized`, validation helpers in `worker/src/validation.ts` that **throw** on unknown keys.
- Admin services: `authedRequest` pattern (`admin/src/services/admin-events.ts:81-98`), `UnauthorizedError` → `onUnauthorized()`.
- Every id from the URL is regex-validated before it touches storage (`/^[a-f0-9-]+$/` for event ids; charts `^c_[a-f0-9]{8}$`; holds `^h_[a-f0-9]{12}$`; seats `^o_[a-z0-9]{1,8}\.\d{1,3}$`).
- D1 `IN (…)` lists are chunked at 90 ids.
- No test runner exists; each phase adds `make lint`, `make build`, `make build-admin`, `cd worker && npx tsc --noEmit` to its checklist, plus a scripted `curl` verification where an API changed. (Adding vitest for `shared/seating` is part of P0 because pure geometry is exactly what unit tests are for.)

---

## Phase 0 — Foundation 🧱 (shared module, D1, docs)

### Files
```
shared/seating/types.ts          SeatingChart, ChartObject (discriminated union), Seat, SeatState
shared/seating/geometry.ts       seatPositions(), objectBounds(), hitTest(), layoutBounds()
shared/seating/ids.ts            newObjectId(), seatId(objectId, n), seatLabel(object, n), parseSeatId()
shared/seating/validate.ts       validateChart(doc): { ok, errors[] }  (rules in DESIGN §4.1)
shared/seating/index.ts          re-exports
shared/seating/geometry.test.ts  vitest (positions for each kind, bounds, rotation, hit test)
shared/seating/validate.test.ts
shared/package.json              { "private": true, devDependencies: { vitest } } — tests only
tsconfig.json (root), admin/tsconfig.app.json, worker/tsconfig.json   paths: "@seating/*": ["../shared/seating/*"] (relative per file)
vite.config.ts, admin/vite.config.ts   resolve.alias @seating → ../shared/seating; server.fs.allow ['..']
worker/wrangler.toml             [[d1_databases]] binding = "SEATING", database_name = "legends-seating", database_id = <id>
worker/src/types.ts              Env += SEATING: D1Database; EventRecord += seating?: EventSeating; PartyRecord += seats?, seatStatus?
worker/migrations/0001_seating.sql   the two tables + indexes from DESIGN §4.4
worker/src/seating/db.ts         thin data layer (see P2/P3 for functions); chunk helper
docs/v0.5/seating-chart/0-DESIGN.md, 1-IMPLEMENTATION.md   these docs, moved in from claude_ops
Makefile                         test-shared, d1-migrate-local, d1-migrate-remote
```

### Steps
1. **Create the D1 database** with the shared account token (the Legends deploy token has no D1 scope — verified 2026-09-08):
   ```bash
   CLOUDFLARE_API_TOKEN=$(agentsecrets get cloudflare_api_token) npx wrangler d1 create legends-seating
   ```
   Store the id in agentsecrets as `legends_d1_seating_id` and paste it into `wrangler.toml`. Apply the migration remotely with the same token (`wrangler d1 migrations apply legends-seating --remote`).
2. **Verify the deploy path still works with the binding present**: `make deploy-worker` under `legends_cloudflare_token`. If wrangler refuses (token lacks D1 read), either widen that token's scope in the dashboard (Leif) or switch `deploy.yml`'s `CLOUDFLARE_API_TOKEN` to the shared token. Record the outcome on the card.
3. Write `types.ts` — the `ChartObject` union with `kind: 'stage' | 'round' | 'rect' | 'row'` exactly as DESIGN §4.1; `EventSeating`; `SeatState = 'available' | 'held' | 'sold' | 'checkedIn' | 'selected'`.
4. Write `geometry.ts` as pure functions over the object union. Rotation applied around the object's own anchor (`x, y`). `seatPositions` returns `{ id, label, x, y }[]` in seat-number order. `hitTest` returns the topmost object under a point (objects later in the array are on top).
5. Write `ids.ts` and `validate.ts`; port the rules table from the design verbatim; error strings are user-facing ("Table T3 has the same label as T1").
6. Wire the alias in all three builds and prove it: a throwaway import in each app compiles and `vite build` resolves it. Remove the throwaway.
7. Add vitest to `shared/` only (`npx vitest run` from `shared/`) and a `make test-shared` target. Cover every kind's seat count, label derivation, rotation invariance of `objectBounds`, and validation rejections.
8. Move both docs into `docs/v0.5/seating-chart/` and add a row to `docs/resources/0-HIGH_LEVEL.md`'s storage table for D1.

### Acceptance criteria
- [ ] `legends-seating` D1 exists remotely with both tables; `wrangler d1 execute legends-seating --remote --command "select count(*) from seats"` returns 0.
- [ ] `make deploy-worker` succeeds with the `SEATING` binding (or the token change is documented and applied).
- [ ] `@seating/*` resolves in `src/`, `admin/`, `worker/` builds; `make lint`, `make build`, `make build-admin`, worker `tsc --noEmit` all green.
- [ ] `make test-shared` passes with ≥ 20 assertions across geometry + validate.
- [ ] Docs landed in `docs/v0.5/seating-chart/`.

---

## Phase 1 — Admin: Seating Charts editor 🎨 + chart CRUD API

### Files
```
worker/src/charts.ts                       handleAdminCharts(): list/create/get/put/duplicate/delete
worker/src/index.ts                        route: startsWith('/api/admin/charts') → handleAdminCharts (before the events branch)
worker/src/validation.ts                   parseChartBody() (name, canvas, objects via validateChart)
shared/seating/SeatMap.tsx                 renderer, mode 'edit' | 'pick' | 'view'; props: layout, states, selection, onSeatTap, onObjectPointerDown, viewBox
shared/seating/SeatMap.module.css          seat/table/stage/stage-label/handle classes using tokens
admin/src/services/charts.ts               listCharts, getChart, createChart, updateChart, duplicateChart, deleteChart
admin/src/components/admin/Charts/ChartsList.tsx (+ .module.css)
admin/src/components/admin/Charts/ChartEditor.tsx (+ .module.css)
admin/src/components/admin/Charts/editor/useEditorState.ts     reducer + history
admin/src/components/admin/Charts/editor/useCanvasGestures.ts  pointer events → intents
admin/src/components/admin/Charts/editor/Palette.tsx, Inspector.tsx, Handles.tsx
admin/src/app/App.tsx                      View += 'charts' | 'chartEdit'; paths /charts, /charts/new, /charts/:id; menu card
```

### Steps — worker
1. `chart:<id>` CRUD in `charts.ts`. `list` = `EVENTS.list({ prefix: 'chart:' })` + a `usedBy` pass over `event:` records with `seating.chartId` and `endTime >= now`. `put` compares `body.revision === stored.revision` → else 409; bumps `revision`, sets `updatedAt`. `delete` → 409 when `usedBy` non-empty. Name uniqueness is case-insensitive across charts.
2. Every write runs `validateChart` (shared) and returns `400 { error: 'Invalid chart', details: { errors } }`.

### Steps — renderer (`SeatMap`)
3. One `<svg viewBox>` sized by the parent; `preserveAspectRatio="xMidYMid meet"`; `touch-action: none; user-select: none`. Renders, per object: shape, label, seats from `seatPositions`. Seat `<circle r=14>` with a `data-seat-id`; state classes `available | held | sold | checkedIn | selected | dim`.
4. Modes: `edit` adds `Handles` for the selection and forwards `pointerdown` with `{ objectId, handle? }`; `pick` and `view` make seats the only interactive element (`onSeatTap(seatId)`). Seat numbers are rendered when the effective scale ≥ 1.5 (computed from viewBox width vs. element width via a `ResizeObserver`).
5. Tap detection: `pointerdown` records origin; `pointerup` within 8 px and 400 ms is a tap. **Never** treat `pointerleave`/`pointercancel` as a cancel of a tap (claude_ops lesson: it fires before `click` on touch).

### Steps — editor
6. `useEditorState`: `{ layout, selection: Set<objectId>, history: { past[], future[] }, dirty }` with actions `add(kind, at)`, `move(ids, dx, dy)`, `rotate(id, deg)`, `resize(id, …)`, `setField(id, patch)`, `duplicate(ids)`, `remove(ids)`, `select`, `undo`, `redo`, `load(doc)`. Every mutating action pushes the previous layout onto `past` (cap 50) and clears `future`. Grid snap = 20 units; rotation snap = 15°.
7. `useCanvasGestures`: maps pointer events on the SVG to intents: drag object / drag handle / pan (two pointers or drag on empty) / pinch-zoom (two pointers, scale about midpoint) / marquee (desktop, drag on empty with mouse) / long-press-to-multiselect (450 ms timer cancelled by movement > 8 px). All coordinates converted with `svg.getScreenCTM().inverse()`.
8. `Palette`: four chips; tap → `add(kind, viewCenter)`; desktop drag → `add(kind, dropPoint)`. Auto-label from `ids.ts` (`nextTableLabel`, `nextRowLabel`). Stage chip disabled when a stage exists.
9. `Inspector`: bottom sheet (phone, `position: sticky; bottom: 0`) / right rail (`@media (min-width: 900px)`). Fields per kind; label input validates live against the shared regex; seats stepper clamps to the kind's range.
10. `ChartEditor` header: name input, seat counter (`layout.objects.reduce(seats)`), Undo/Redo/Fit buttons, Save. Save → create or update; on 409 show "This chart changed elsewhere — Reload?" `beforeunload` guard when `dirty`.
11. `ChartsList`: cards with name, seat count, object summary, updatedAt, Used by; Edit / Duplicate / Delete (ConfirmModal, disabled with reason when used by an upcoming show); **New seating chart**.
12. `App.tsx`: add the routes and the menu card ("Seating Charts — build and reuse venue layouts").

### Acceptance criteria
- [ ] On a 390 × 844 viewport (Chrome device mode), a new chart can be built with one hand: add 6 round tables, 1 rect, 1 row of 12, the stage; move, rotate, resize, relabel, change seat counts; undo/redo; save; reopen and see it intact.
- [ ] Two charts saved with distinct names; duplicate creates "Copy of …"; delete works when unused.
- [ ] `PUT` with a stale `revision` → 409 and the editor offers Reload; invalid label → inline error and Save disabled.
- [ ] Pinch-zoom and two-finger pan work on a real iPhone (Leif checks); page itself never zooms or scrolls while gesturing on the canvas.
- [ ] `curl` script in the PR description exercises list/create/get/put(409)/duplicate/delete.

---

## Phase 2 — Attach a chart to a show 🔗 (snapshot + D1 materialization + capacity)

### Files
```
worker/src/validation.ts        parseEventDraft + parseEventPatch allow-lists += seatingChartId (string | null)
worker/src/index.ts             finalizeEventCreation + PATCH handler: attach/detach; POST /api/admin/events/:id/seating/resync; eventRecordToPublic += seating: { seatCount }
worker/src/seating/db.ts        materializeSeats(showId, layout), deleteShowSeats(showId), seatSummary(showId)
worker/src/seating/attach.ts    attachChart(env, record, chartId) → record'; detachChart(); resync()
admin/src/services/admin-events.ts   EventDraftInput/EventPatchInput/ManagedEvent += seatingChartId / seating
admin/src/components/admin/EventForm/EventForm.tsx   Seating chart <select>; capacity disabled + hint when set
admin/src/components/admin/ManageShows/EditShow.tsx  same; 409 surfaced as inline error
admin/src/components/admin/ManageShows/ManageShows.tsx  "Reserved seating · <name> · N seats" pill; Re-sync button (sold = 0)
src/types/event.ts              CalendarEvent += seating?: { seatCount }
```

### Steps
1. `attachChart`: load `chart:<id>` (404 if missing), `validateChart`, compute `seatCount`, set `record.seating = { chartId, chartName, chartRevision, seatCount, attachedAt, layout }`, set `record.capacity = seatCount`, recompute `soldOut` (`sold >= seatCount`). Then `materializeSeats` — `INSERT OR IGNORE INTO seats (show_id, seat_id, label, object_id, status, updated_at)` in chunks of 90 rows via `batch()`.
2. Detach / change while `sold > 0` → **409** `{ error: 'This show has sold N seats; seating cannot be changed' }`. With `sold = 0`: `deleteShowSeats` then attach the new one (or clear). Order: write D1 first, then KV, so a KV failure leaves a superset in D1 that the next attach reconciles (`INSERT OR IGNORE`).
3. Create path (`finalizeEventCreation`): accept `seatingChartId` in the JSON payload of the multipart `payload` field; attach after the event id is minted, before the KV write, so the record is written once.
4. `DELETE /api/admin/events/:id` also calls `deleteShowSeats` (and deletes the show's holds).
5. `GET /api/admin/events` already spreads the record, so `seating` flows to the admin automatically; strip `seating.layout` from the **list** response (size) and keep it on the single-event GET.
6. Public `eventRecordToPublic`: add `seating: { seatCount }` when present. Nothing else.
7. Forms: `<select>` populated from `listCharts()`; when non-empty, capacity input `disabled` with hint "Capacity comes from the seating chart (96 seats)". EditShow keeps sending the full patch; include `seatingChartId` always (null for GA).
8. Manage Shows: pill + Re-sync (calls the resync endpoint; only rendered when `seating && sold === 0`). Capacity meter unchanged (reads `capacity`).

### Acceptance criteria
- [ ] Creating a show with a chart yields an event record with `seating` (layout snapshot), `capacity = seatCount`, and exactly `seatCount` rows in D1 for that show (`select count(*) … where show_id=?`).
- [ ] Editing the master chart afterwards does **not** change the show; Re-sync does (while `sold = 0`).
- [ ] Attempting to change/detach seating on a show with `sold > 0` (simulate by writing `sold: 1` to KV) → 409 surfaced inline in EditShow.
- [ ] Deleting the show removes its D1 rows.
- [ ] `GET /api/events` shows `seating.seatCount` for that show and nothing for GA shows; the GA create/edit path is byte-for-byte unchanged in behaviour (create a GA show and diff its record against a pre-phase one).

---

## Phase 3 — Buyer seat picker 🎟️ + holds + checkout + webhook confirmation

### Files
```
worker/src/seating/db.ts        availability(showId), claim(showId, seatIds, holdId, ttl), release(holdId), extend(holdId, ttl), findHoldByOrder(orderId), confirm(showId, holdId, partyKey) → wonSeatIds
worker/src/seating/holds.ts     handleSeatingPublic(): GET seating, POST hold, DELETE hold
worker/src/index.ts             routes: ^/api/events/([a-f0-9-]+)/seating$, ^/api/events/([a-f0-9-]+)/seats/hold(?:/(h_[a-f0-9]{12}))?$; handleCheckout += holdId; processCompletedPayment += confirm step
worker/src/services/square.ts   createPaymentLink itemName unchanged in shape (labels added by the caller)
src/services/events.ts          fetchSeating(eventId), holdSeats(eventId, body), releaseHold(eventId, holdId), startCheckout(…, holdId?)
src/components/marketing/TicketModal/TicketModal.tsx   step machine: qty → seats → paying
src/components/marketing/TicketModal/SeatPicker.tsx (+ .module.css)   uses @seating/SeatMap mode="pick"
```

### Step 0 — prove the correlation first 🔬
Sandbox (`SQUARE_ENVIRONMENT=sandbox` in `.dev.vars`): mint a link via the existing checkout endpoint, note the returned `orderId`; pay with a sandbox card; confirm the webhook's `payment.order_id` equals it. **GO** → proceed as designed. **NO-GO** → append `:h=<holdId>` to the payment note and extend `parsePaymentNote`'s regex to `^legends-event:([^:]+):(.+):(\d+)(?::h=(h_[a-f0-9]{12}))?$`; record the result on the card.

### Steps — worker
1. `GET /api/events/:id/seating` (no-store): `{ layout: event.seating.layout, seats: { [seatId]: 'available' | 'taken' } }` where taken = `sold` or (`held` and `hold_expires_at > now`). 404 for GA shows.
2. `POST /api/events/:id/seats/hold`: validate body (`seatIds` array of 1–20 valid ids, unique, length === `quantity`, `ticketType` exists on the event, event not sold out / ended). Insert hold row (`active`, `expires_at = now + 12 min`), then **claim** per DESIGN §6.3 (conditional UPDATE, check `meta.changes`, compensate on shortfall, respond `409 { error: 'Some seats were just taken', unavailable: [...] }`). Before the UPDATE, `SELECT hold_id FROM seats WHERE … AND status='held' AND hold_expires_at < now` to find superseded holds → mark `superseded` + `ctx.waitUntil(deactivatePaymentLink(square_link_id))` each. Respond `{ holdId, expiresAt }`.
3. `DELETE /api/events/:id/seats/hold/:holdId`: release seats where `hold_id = ?`, hold → `released`. Idempotent 200.
4. `handleCheckout`: if the event has `seating`, `holdId` is **required**; load the hold, 409 if not `active`/expired/wrong event/ticketType/quantity mismatch. Item name becomes `${ticketType} × ${quantity} · ${labels.join(', ')} · ${date} · ${venue}`. After `createPaymentLink`, `UPDATE seat_holds SET square_order_id=?, square_link_id=?, expires_at=now+12min` and extend the seat rows' `hold_expires_at` likewise. GA shows ignore `holdId`.
5. `processCompletedPayment`: after the party record is built and **before** it is written, `findHoldByOrder(orderId)`; if found, `confirm()` → `UPDATE seats SET status='sold', party_key=?, hold_id=NULL, hold_expires_at=NULL WHERE show_id=? AND seat_id IN (…) AND (hold_id=? OR status='available')` (chunked), collect the won ids via a follow-up `SELECT … WHERE party_key=?`; hold → `converted`. Write `party.seats` + `seatStatus` (`assigned` | `partial` | `unassigned`). If the show has seating but no hold matched → `seatStatus: 'unassigned'`, `seats: []`. Log a `console.warn` for `partial`/`unassigned`. `sold` increments unchanged.
6. `clearLinkCache` (sold-out path) unchanged; additionally when a show flips `soldOut`, nothing seat-specific is needed (no available seats remain by construction).

### Steps — site
7. `TicketModal` step machine: `qty` (today's rows; the button reads **Choose seats** for seating shows) → `seats` (`SeatPicker`) → `paying` (spinner then redirect). Back arrow returns to `qty` and releases any hold.
8. `SeatPicker`: fetches seating on mount (and on 409 recovery); renders `SeatMap mode="pick"`; state: `selected: string[]`, `hold`, `countdown`. Behaviours from DESIGN §6.1 step 3: table-tap selects `quantity` adjacent free seats (adjacency = consecutive seat numbers on the same object, wrapping on round tables); **Best available** = the free run of `quantity` seats on the object whose centroid is closest to the stage (fallback: nearest to canvas top). Footer: chosen labels, **Continue to payment** (disabled until `selected.length === quantity`), countdown after hold.
9. Continue → `holdSeats` → on 409 refresh + toast "T1-3 was just taken — pick again" and un-select the lost ones → on 200 `startCheckout(id, type, qty, holdId)` → `window.location.href`. Modal close / back → `releaseHold` via `fetch(…, { method: 'DELETE', keepalive: true })`.
10. Picker default zoom: fit the bounding box of all seat objects (not the whole canvas) to the modal width; enable pinch/pan from `SeatMap`; **Fit** button.

### Acceptance criteria
- [ ] Step 0 result recorded (GO/NO-GO) before any UI work.
- [ ] Concurrency: a script fires 20 parallel `POST …/seats/hold` for the same 2 seats; exactly one 200, nineteen 409s, and D1 shows those seats held by the winner only.
- [ ] Sandbox purchase end-to-end: pick 2 seats → hold → Square sandbox pay → webhook → party has `seats` = those 2 ids, D1 rows `sold` with the party key, `sold` counter +2, capacity meter reflects it.
- [ ] Expired-hold path: set a hold's `expires_at` in the past, have another buyer claim the seats, then complete the first payment → first party `seatStatus: 'unassigned'`, logged; second party assigned. No payment lost.
- [ ] Closing the modal releases the hold (D1 rows back to `available`).
- [ ] GA shows: `TicketModal` behaviour identical to today (no seating fetch, no hold, same POST body plus nothing).
- [ ] Site bundle delta < 25 KB gzipped (`vite build` report).
- [ ] Phone check on a real device: table tap selects a run, individual taps toggle, pinch works, footer stays reachable, countdown visible.

---

## Phase 4 — Live occupancy: Door Check-in toggle + Manage Shows button 🚪

### Files
```
worker/src/index.ts              handleGetEventGuests += seating: { layout, seats: { [seatId]: { status, partyId? } } }; partyRecordToParty += seats, seatStatus, seatLabels
worker/src/seating/db.ts         occupancy(showId) → rows (status, hold state, party_key)
admin/src/types/guestlist.ts     Party += seats?, seatLabels?, seatStatus?
admin/src/services/admin-events.ts   getEventGuests return type += seating
admin/src/components/guestlist/Guestlist.tsx        List | Chart toggle (localStorage 'guestlist:view'), polling, seat stats, tap-seat → CheckInModal
admin/src/components/guestlist/OccupancyChart.tsx (+ .module.css)   SeatMap mode="view" + legend + counts + needs-seats banner
admin/src/components/guestlist/CheckInModal.tsx     "Seats: T1-3, T1-4" line
admin/src/components/guestlist/print-sheet.ts       Seats column
admin/src/components/admin/ManageShows/ManageShows.tsx   [Seating chart] button → SeatingModal
admin/src/components/admin/ManageShows/SeatingModal.tsx  OccupancyChart + Re-sync (sold=0) + Unassigned list (P5 wires Assign)
```

### Steps
1. Worker: `occupancy(showId)` = `SELECT seat_id, status, hold_expires_at, party_key FROM seats WHERE show_id=?`; map to `{ status: 'available' | 'held' | 'sold', partyId }` (expired holds → available). Merge with `checkedIn` in the client to derive `checkedIn` seat state. `partyRecordToParty` adds `seats`, `seatLabels` (derived via `seatLabel` from the snapshot layout), `seatStatus`.
2. `OccupancyChart`: props `{ layout, seats, checkedIn, parties, onSeatTap }`; computes per-seat `SeatState` (`checkedIn` when its party is in `checkedIn`), renders `SeatMap mode="view"`, a legend (Available / Sold / Arrived / Held), counts (`arrivedSeats / soldSeats / total`), and a banner listing parties with `seatStatus !== 'assigned'`.
3. `Guestlist.tsx`: segmented control **List | Chart** in the roster header; persisted. Chart mode renders `OccupancyChart`; tapping a sold seat opens the existing `CheckInModal` for its party (lookup by `partyId`). Optimistic check-in already updates `checkedIn`, so the seat flips instantly.
4. **Polling**: `useEffect` with `setInterval(refetch, 8000)` while `view === 'chart'` and `document.visibilityState === 'visible'`; `visibilitychange` listener pauses/resumes; refetch merges server `checkedIn` **over** local optimistic state only for parties not currently `busy`.
5. Stats row: add "**41 / 96 seats arrived**" for seating shows. Print sheet: Seats column after Qty.
6. Manage Shows: **Seating chart** button (ghost) between Mark sold out and Delete, only for seating shows; opens `SeatingModal` (full-screen sheet on phone) with the same `OccupancyChart`, same polling, plus Re-sync (moved here from P2's card toolbar) and the unassigned list.

### Acceptance criteria
- [ ] Door Check-in on a seating show: toggle to Chart; sold seats gold, arrived green; tap a seat → correct party modal → check in → seat turns green immediately; a second phone on the same show sees it within 8 s without touching anything.
- [ ] Toggling away and back preserves the chosen view across reloads.
- [ ] GA shows show no toggle and are unchanged.
- [ ] Manage Shows → Seating chart opens the same view with correct counts; closes cleanly; polling stops when closed (verify no requests in devtools after close).
- [ ] Print sheet shows seat labels.

---

## Phase 5 — Admin seat assignment, docs/SOPs, live verification, handoff 🚀

### Files
```
worker/src/index.ts              PUT /api/admin/events/:id/parties/:paymentId/seats
worker/src/seating/db.ts         reassign(showId, partyKey, seatIds) — release old, claim new atomically (batch), 409 with unavailable[]
admin/src/services/admin-events.ts   setPartySeats(eventId, paymentId, seatIds)
admin/src/components/guestlist/CheckInModal.tsx   "Change seats" → SeatAssignSheet
admin/src/components/guestlist/SeatAssignSheet.tsx   SeatMap mode="pick" over available seats, quantity = party.quantity
admin/src/components/admin/ManageShows/SeatingModal.tsx   Assign seats on unassigned rows → SeatAssignSheet
docs/resources/1-SOPS.md         SOP 2 gains "Seating chart" step; new SOP 7 — Build a seating chart 🎤; SOP 5 gains the Chart toggle; quick-reference table row
docs/resources/0-HIGH_LEVEL.md   D1 + seating in the storage/architecture sections
docs/agents/0-ADDING_EVENTS.md   seatingChartId in the payload
README.md                        D1 binding, make targets, admin routes
```

### Steps
1. `reassign`: one `batch()` — release `WHERE party_key=?`, then conditional claim to `sold` for the new ids `WHERE status='available'`; if `changes < n`, compensate (restore old assignment from the pre-read) and 409. Update `party.seats`/`seatStatus` in KV after D1 succeeds.
2. `SeatAssignSheet`: reuses the buyer picker's selection logic (table-tap run, best available) in admin colours; Save → `setPartySeats`.
3. Wire **Assign seats** (unassigned banner) and **Change seats** (party modal) in both Door Check-in and Manage Shows.
4. Docs + SOPs per the file list; screenshots of the editor, picker and door chart into `docs/v0.5/seating-chart/img/`.
5. **Live verification** on production with a real $1 test ticket type on a private test show (then delete the show): build a chart, attach, buy 2 seats from a phone, check in from a second phone with Chart view, reassign once, delete the show.
6. PR per phase already merged; this phase's PR closes the epic checklist; handoff comment on the epic with evidence (D1 counts, screenshots, the sandbox + prod purchase ids).

### Acceptance criteria
- [ ] An `unassigned` party can be given seats from the chart in under 15 s on a phone; a `partial` party can be topped up; a normal party can be moved; conflicts 409 with the lost seats named.
- [ ] SOPs updated and accurate against the shipped UI; README lists the D1 binding and the new routes.
- [ ] Production live-verification script above completed and recorded on the epic; test show deleted; D1 has no rows for it.
- [ ] Epic acceptance criteria all ticked; handoff posted; `@leif` notified.

---

## File change inventory (quick reference)

| Area | New | Modified |
| --- | --- | --- |
| `shared/seating/` | types, geometry, ids, validate, SeatMap(.tsx/.module.css), tests, package.json | — |
| `worker/` | `migrations/0001_seating.sql`, `src/charts.ts`, `src/seating/{db,attach,holds}.ts` | `wrangler.toml`, `src/types.ts`, `src/index.ts`, `src/validation.ts`, `tsconfig.json` |
| `admin/` | `components/admin/Charts/**`, `components/guestlist/{OccupancyChart,SeatAssignSheet}.tsx`, `components/admin/ManageShows/SeatingModal.tsx`, `services/charts.ts` | `app/App.tsx`, `services/admin-events.ts`, `types/guestlist.ts`, `EventForm.tsx`, `EditShow.tsx`, `ManageShows.tsx`, `Guestlist.tsx`, `CheckInModal.tsx`, `print-sheet.ts`, `vite.config.ts`, `tsconfig.app.json` |
| `src/` (site) | `components/marketing/TicketModal/SeatPicker.tsx` | `TicketModal.tsx`, `services/events.ts`, `types/event.ts`, `vite.config.ts`, `tsconfig.json` |
| docs | `docs/v0.5/seating-chart/**` | `docs/resources/{0-HIGH_LEVEL,1-SOPS}.md`, `docs/agents/0-ADDING_EVENTS.md`, `README.md`, `Makefile`, `.github/workflows/deploy.yml` (token if needed) |

## Risk notes

- **D1 in the deploy token** — settle in P0 step 2 before anything else is built on the binding.
- **Order-id correlation** — P3 step 0 is a hard gate.
- **KV/D1 dual write** on attach and confirm — D1 first, KV second, and every D1 write idempotent (`INSERT OR IGNORE`, conditional `UPDATE`s) so a retry converges.
- **iOS gestures** — `touch-action: none` on the SVG, no `pointerleave` cancels, 450 ms long-press with movement cancel; test on a real device in P1 and P3, not only in device mode.
- **Bundle size on the public site** — the renderer is shared, but the picker must not pull the editor's reducer/gesture code; keep editor modules under `admin/` only.
- **Legacy `checkin:` prefix collision** (date vs. uuid show ids) is pre-existing; seating keys never touch `GUESTLIST` except the two new fields on `party:` records.
