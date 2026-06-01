# v0.3 — MVP Implementation Plan

**Design:** [`1-DESIGN.md`](./1-DESIGN.md). Build in order; each phase ends at a
verifiable checkpoint. Optimized for **speed to production**: the quantity fix
(actively broken today) ships as **Milestone A** before the webhook/check-in work.

```
Phase 0  Spike (GO/NO-GO)              ── de-risk before building
─ Milestone A (quantity + capacity) ─ ship ASAP
Phase 1  Square catalog service
Phase 2  Data model + create/patch/delete
Phase 3  Sold-out surfacing (site + form)
─ Milestone B (auto-guestlist + check-in) ─
Phase 4  Webhook → auto roster
Phase 5  Multi-event check-in app
Phase 6  Secrets, deploy, docs
```

Conventions (same as v0.2): worker = `worker/`, frontend = `src/`. After each phase run
`make lint` and `cd worker && npx tsc --noEmit`. Square sandbox creds + location
`LXEVF5FVYSZSC` are in the gitignored `DO_NOT_COMMIT.md`; test against sandbox via
`wrangler dev` (`SQUARE_ENVIRONMENT=sandbox`) before prod. Never commit secrets.

---

## Phase 0 — Spike (GO/NO-GO) 🔬

**Goal:** prove the two unknowns from the design before writing feature code. Do this
in a throwaway script / `curl` against the **Square sandbox**.

1. **Quantity + inventory (Spike #0, gating):**
   - `UpsertCatalogObject` → an ITEM with one ITEM_VARIATION (price), `track_inventory: true`.
   - `BatchChangeInventory` → set the variation stock to a small number (e.g. 3).
   - `CreatePaymentLink` with an `order` line item referencing the variation's
     `catalog_object_id`, quantity `"1"`.
   - **Open the checkout URL in a browser.** Confirm: (a) a **quantity selector** is
     shown, (b) buying reduces stock, (c) at 0 stock the checkout **blocks**.
2. **Custom field + buyer data (Spike #1):**
   - Add `checkout_options.custom_fields: [{ title: "Full name (for the guest list)" }]`.
   - Complete a sandbox purchase (qty 2). Then `GET /v2/orders/{order_id}` and find:
     line-item **quantity**, **custom-field response** (record exactly where it lives),
     and `fulfillment.recipient` email/phone.

**Checkpoint / decision:**
- ✅ Quantity selector works → proceed as designed.
- ❌ No selector on API links → **stop and pick a fallback with the user** (fixed-qty
  bundle links, or keep `quick_pay` + our own counter and defer quantity). Don't build
  blindly.
- Record where the custom-field name is read from — Phase 4 depends on it. If it's not
  retrievable, the door list falls back to recipient email/phone.

Write findings into this file (a short "Spike results" note) before Phase 1.

### Spike results (2026-05-31) — ❌ NO-GO on catalog-for-quantity

Tested in sandbox **and** production (read-only; artifacts deleted):
- ✅ Catalog item + variation with `track_inventory` creates fine; inventory set/read works.
- ✅ Order-based payment link with a `catalog_object_id` line item creates fine.
- ✅ `checkout_options.custom_fields` ("Full name…") renders on the checkout.
- ✅ Production token **has** catalog + inventory scopes.
- ❌ **The hosted checkout shows NO quantity selector** — confirmed by opening the real
  production checkout page. So an **API-created payment link (quick_pay *or* order/catalog)
  does not let the buyer choose quantity.** That capability appears limited to
  dashboard/Square-Online "Sell an item" links, which we can't drive via the API.

**Implication:** the catalog-items plan's main draw (quantity) doesn't hold, so it's not
worth its lifecycle cost. **Recommended pivot → "Option E: dynamic links + our own
quantity UI":**
- Ticket modal gets **our own quantity stepper**. On Buy, the worker **mints a `quick_pay`
  link priced N × unit** (name `"<ticketType> × N · <date> · <venue>"`, `payment_note`
  carries `<eventId>:<ticketType>:<qty>`) and redirects. Buyer-chosen quantity, correct
  total, Square stays the processor — **no catalog/inventory refactor**.
- **Capacity** via our own KV counter (fed by the webhook), checked before minting;
  small oversell already accepted. (Drop Square-inventory enforcement.)
- **Auto-guestlist** unchanged: webhook → custom-field name + qty (from `payment_note`) → party.
- **Sharing/QR** shifts from the raw Square link to a **site URL** that opens the event
  with the stepper (branded + quantity-capable). Manage Shows' Copy-link/QR produce that.

This is *simpler* than the catalog design and actually delivers quantity. **Pending your
OK, I'll revise `1-DESIGN.md` + Phases 1–6 to Option E before building.**

---

## Phase 1 — Square catalog service 🧱

**Goal:** `worker/src/services/square.ts` can manage the full catalog lifecycle. Pure
service layer, no routing yet.

1. Add `SQUARE_API_VERSION` calls for:
   - `upsertTicketItem(env, { name, variations: [{ ticketType, priceCents }] })` →
     `POST /v2/catalog/object` (ITEM + ITEM_VARIATIONs, `track_inventory: true`).
     Returns real `{ itemId, variations: [{ ticketType, variationId }] }` (map Square's
     temp-id → real-id response).
   - `setInventory(env, variationId, quantity)` → `POST /v2/inventory/changes/batch-create`
     (`PHYSICAL_COUNT`, `state: IN_STOCK`, `location_id`).
   - `getInventory(env, variationIds[])` → `POST /v2/inventory/counts/batch-retrieve` →
     remaining per variation.
   - `createItemPaymentLink(env, { eventId, ticketType, variationId, redirectUrl })` →
     `CreatePaymentLink` with `order.line_items: [{ catalog_object_id, quantity: "1" }]`,
     `checkout_options.custom_fields` (name) + `redirect_url`, `payment_note`.
   - `deleteCatalogItem(env, itemId)` → `DELETE /v2/catalog/object/{itemId}` (removes
     variations too). Keep `deactivatePaymentLink` for links.
2. Keep the old `createPaymentLink` (quick_pay) temporarily for reference / rollback;
   delete in Phase 6 once catalog is proven.

**Checkpoint:** a scratch route or the Phase 0 script drives create→setInventory→link→
read-inventory→delete end-to-end against sandbox. Remove scratch code before commit.

---

## Phase 2 — Data model + create/patch/delete 🗃️

**Goal:** events are created/managed via catalog items; `capacity` is stored and enforced
by inventory.

1. **Types** (`worker/src/types.ts`): `EventRecord` += `capacity: number | null`,
   `soldOut: boolean`; `EventTicket` += `catalogItemId: string`, `catalogVariationId: string`.
2. **Validation** (`worker/src/validation.ts`): `parseEventDraft` + `parseEventPatch`
   accept optional `capacity` (integer ≥ 1).
3. **Create** (`finalizeEventCreation` in `index.ts`): replace the per-ticket
   `createPaymentLink` loop with: `upsertTicketItem` (all ticket types) → `setInventory`
   = `capacity` per variation (skip if capacity null) → `createItemPaymentLink` per
   variation. Store catalog ids + links. Same abort/cleanup discipline (on failure:
   delete catalog item, deactivate any links). `soldOut` starts `false`.
4. **Patch** (`handlePatchEvent`): `capacity` change → `setInventory` to the new count;
   `tickets`/price change → upsert variation price (or recreate item+link), re-mint link;
   metadata-only → unchanged. `soldOut` manually settable.
5. **Delete** (`handleDeleteEvent`): also `deleteCatalogItem` for each ticket's
   `catalogItemId` (dedupe), plus existing link-deactivate + image-delete.

**Checkpoint (sandbox, via JSON API):** create a show with capacity 3 → buy via the
link with quantity → inventory decrements; GET shows catalog ids; delete removes catalog
objects (verify via `GET /v2/catalog/object/{id}` → not found).

---

## Phase 3 — Sold-out surfacing (site + form) 🚫  → **ship Milestone A**

**Goal:** capacity is visible and stops sales; buyers can buy N. (Auto-roster not needed
for this milestone — sold-out is driven by inventory + a light read.)

1. **Worker:** `eventRecordToPublic` exposes `soldOut`. Compute `soldOut` either from the
   stored flag or a cached inventory read (cheap: include in the existing 60s-cached feed).
   Add `remaining` to the admin list/get.
2. **Frontend:** `types/event.ts` += `soldOut?`, `capacity?`. `Calendar.tsx` /
   `TicketModal.tsx`: when `soldOut`, render a disabled **"Sold Out"** in place of Buy;
   keep the card. `EventForm` + `ManageShows`: capacity input; show remaining; manual
   sold-out toggle (PATCH `soldOut`).
3. **Docs:** update `public/openapi.json`, `2-API.md`, agent runbooks with
   `capacity`/`soldOut`.

**Checkpoint / SHIP:** deploy worker + frontend. A new show created with capacity sells N
per checkout, and shows "Sold Out" once inventory hits 0. **This is the urgent fix —
release it before Milestone B.**

---

## Phase 4 — Webhook → auto roster 🪝

**Goal:** completed purchases auto-build a per-event party roster (no CSV).

1. **Secret + subscription:** `wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY`; in the
   Square dashboard subscribe `payment.updated` (+ `order.updated`) to
   `https://djkmdlegends.com/api/square/webhook`.
2. **Verify util** (`square.ts`): port `verifyWebhookSignature` from the reference repo
   (HMAC-SHA256 over `notificationUrl + rawBody`, base64, timing-safe compare).
3. **Route** `POST /api/square/webhook` (`index.ts`, public, no Bearer):
   - Read raw body (need exact bytes for the HMAC). Verify signature → 401 on mismatch.
   - Completed payments only; dedup on `event_id` (`wh:<id>` KV marker) and `paymentId`.
   - `GET /v2/orders/{order_id}` → `payment_note` (`legends-event:<eventId>:<ticketType>`),
     line-item quantity, recipient email/phone, custom-field name (per Spike #1).
   - Write `party:<eventId>:<paymentId>` in `GUESTLIST` KV. Read inventory (or sum) →
     if remaining ≤ 0, set `soldOut` + deactivate links.
   - Return `200` fast; use `ctx.waitUntil` for the order fetch / writes.

**Checkpoint:** complete a sandbox purchase → a `party:*` key appears with the right name
+ quantity; duplicate webhook delivery doesn't double-add; bad signature → 401.

---

## Phase 5 — Multi-event check-in app 🎟️

**Goal:** `/admin/checkin` prompts for an event (Upcoming / Previous) and checks people in
against the auto roster.

1. **Worker endpoints (admin-gated):** `GET /api/admin/events/:id/guests` →
   `{ parties, checkedIn }` (read `party:<id>:*` + `checkin:<id>:*`);
   `POST /api/admin/events/:id/checkin` and `DELETE …/checkin` (`{ paymentId }`).
2. **Frontend** (`src/components/guestlist/`): new **event picker** landing — fetch
   `GET /api/admin/events`, split **Upcoming** (`endTime ≥ now`) vs collapsible
   **Previous events**; pick → roster view. Reuse `PartyList`/`PartyRow`/`CheckInModal`/
   `SearchBar`, repointed date→eventId, partyId→paymentId. Service in
   `src/services/admin-events.ts` (or a small `checkin.ts`).
3. Keep legacy `/api/guestlist/*` + `tools/ingest-guestlist.mjs` for the 2 grandfathered
   shows.

**Checkpoint (SHIP Milestone B):** open `/admin/checkin` → pick an upcoming event → its
auto-built roster loads → check a party in/out; past events visible under Previous.

---

## Phase 6 — Secrets, deploy, cleanup, docs 🚀

1. Production Square: the existing `SQUARE_ACCESS_TOKEN` (production) needs **catalog +
   inventory** scopes — verify the `ticket_tracker` token has them; re-issue if not.
   Set `SQUARE_WEBHOOK_SIGNATURE_KEY` (production subscription).
2. Deploy worker + frontend (the usual `wrangler deploy` / `pages deploy`).
3. Remove the dead `quick_pay` `createPaymentLink` path.
4. Update `public/openapi.json` (webhook, guests endpoints, `capacity`/`soldOut`),
   `docs/v0.2/event_form/2-API.md`, and the agent runbooks (`docs/agents/`).
5. Smoke test in prod: create a throwaway capacity-2 show → buy 2 (sold out) → verify
   "Sold Out" + roster + check-in → delete (catalog cleaned up).

---

## File inventory

**Worker:** `services/square.ts` (catalog/inventory/webhook-verify — biggest change),
`types.ts`, `validation.ts`, `index.ts` (create/patch/delete rewire, webhook route,
guests + check-in routes, public mapper).
**Frontend:** `types/event.ts`, `components/marketing/{Calendar,TicketModal}`,
`components/admin/EventForm`, `components/admin/ManageShows`, `components/guestlist/*`
(event picker + repoint), `services/admin-events.ts`.
**Config/docs:** `worker/.dev.vars.example` (+`SQUARE_WEBHOOK_SIGNATURE_KEY`),
`public/openapi.json`, `docs/v0.2/event_form/2-API.md`, `docs/agents/*`.

## Risk notes

- **Spike #0 gates everything** — do not start Phase 1 until quantity-on-API-links is proven.
- **Catalog lifecycle is the main new failure surface:** create/patch/delete must keep
  catalog + inventory + links + KV in sync; keep the abort-and-cleanup discipline from v0.2
  (KV write is the commit point; clean up Square/R2 on failure).
- **Webhook raw body:** verify the signature over the *exact* received bytes — don't
  re-serialize JSON first.
- **Token scopes:** catalog/inventory calls fail loudly if the production token lacks
  `ITEMS_*`/`INVENTORY_*` permissions — check early (Phase 6 step 1, but verify in sandbox first).
- **Backward compatible:** the 2 existing quick_pay shows keep working; only new shows use catalog.
