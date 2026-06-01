# v0.3 — IMPLEMENTATION V2 (Option E)

**Design:** [`DESIGN_V2.md`](./DESIGN_V2.md). Supersedes `2-MVP-IMPLEMENTATION.md` (whose
Phase 0 spike drove this rewrite). Build in order; each phase ends at a verifiable
checkpoint. Optimized for speed-to-prod: the **quantity fix ships as Milestone A** before
the webhook/check-in work.

```
── Milestone A (quantity + manual sold-out) — ship ASAP ──
Phase 1  Data model + create/patch/delete simplification
Phase 2  Dynamic checkout endpoint
Phase 3  Frontend: stepper, deep link, sold-out, share-URL  → SHIP
── Milestone B (auto-guestlist + auto-capacity + check-in) ──
Phase 4  Square webhook → roster + sold counter + auto sold-out
Phase 5  Multi-event check-in app
Phase 6  Secrets, deploy, docs, cleanup
```

Conventions: worker = `worker/`, frontend = `src/`. After each phase: `make lint` +
`cd worker && npx tsc --noEmit`. Test against the Square **sandbox** via `wrangler dev`
(`SQUARE_ENVIRONMENT=sandbox`, location `LXEVF5FVYSZSC`) before prod; creds in the gitignored
`DO_NOT_COMMIT.md`. Never commit secrets. The dynamic model means **no upfront Square calls**,
so most create/patch/delete logic gets *smaller*.

---

## Phase 1 — Data model + create/patch/delete simplification 🗃️

**Goal:** events store ticket *configs* + `capacity`; creation no longer mints Square links.

1. **Types** (`worker/src/types.ts`): `EventRecord` += `capacity: number | null`,
   `sold: number`, `soldOut: boolean`. `EventTicket` → `{ ticketType; priceCents }`; keep the
   old `checkoutUrl?`/`squarePaymentLinkId?`/`squareOrderId?` **optional** for back-compat reads.
2. **Validation** (`validation.ts`): `parseEventDraft`/`parseEventPatch` accept optional
   `capacity` (int ≥ 1) and (PATCH only) `soldOut` (bool). Tickets validated as today (type +
   price), no Square fields.
3. **Create** (`finalizeEventCreation`, `index.ts`): **delete the Square link-minting loop.**
   Just validate → store image → write `event:<id>` with `tickets:[{ticketType,priceCents}]`,
   `capacity`, `sold:0`, `soldOut:false`. (Create makes zero Square calls now.)
4. **Patch:** metadata/capacity/soldOut as fields; on `tickets`/price change, **clear the link
   cache** (`EVENTS.list({prefix:'link:<id>:'})` → delete + best-effort `deactivatePaymentLink`).
5. **Delete:** remove `event:<id>` + image; deactivate & delete cached `link:<id>:*`.
6. **Public mapper** (`eventRecordToPublic`): expose `soldOut`; keep `tickets[].priceCents`
   (drop reliance on `checkoutUrl`). Admin GET adds `remaining = capacity - sold`.

**Checkpoint:** create/patch/delete an event via the JSON API (sandbox) — no Square calls on
create; capacity stored; GET returns `capacity`/`sold`/`soldOut`.

---

## Phase 2 — Dynamic checkout endpoint 💳

**Goal:** `POST /api/events/:id/checkout` mints a correctly-priced link for N tickets.

1. **`square.ts`:** keep `createPaymentLink` (`quick_pay`) + `deactivatePaymentLink`. Ensure
   it sets `checkout_options.custom_fields: [{ title: 'Full name (for the guest list)' }]`.
2. **Route** (`index.ts`, public): `POST /api/events/:id/checkout`, body `{ ticketType, quantity }`.
   - Load event; resolve `ticketType`→`priceCents`; validate `quantity` ∈ 1..`MAX_QTY` (20).
   - **Capacity gate:** `soldOut` → `409 {error:"Sold out"}`.
   - **Cache:** `link:<id>:<ticketType>:<qty>` → return if present.
   - Else mint `quick_pay` (`amount = qty*priceCents`, `name = "<ticketType> × <qty> · <date> · <venue>"`,
     custom field, `payment_note = legends-event:<id>:<ticketType>:<qty>`, redirect). Cache + return `{ checkoutUrl }`.
   - CORS: same `getCorsHeaders` (origin-restricted is fine; buyers are on our site).

**Checkpoint (sandbox):** `POST …/checkout {ticketType, quantity:3}` returns a link whose
Square order totals 3×unit; second identical call returns the **cached** URL (same link id).

---

## Phase 3 — Frontend: stepper, deep link, sold-out, share URL 🎟️ → **ship Milestone A**

**Goal:** buyers pick quantity; shares/QRs open the event on-site; manual sold-out works.

1. **Service** (`src/services/`): `startCheckout(eventId, ticketType, quantity)` → POST → returns
   `checkoutUrl`; caller does `window.location.href = checkoutUrl`.
2. **`TicketModal`:** per ticket type, a **quantity stepper** (1..20) + unit price + **Buy**
   (calls `startCheckout`, disables while loading, then redirects). `event.soldOut` → disabled
   **"Sold Out"**. Legacy calendar events keep the `parseDescription` path.
3. **Deep link:** `App.tsx`/`Calendar` read `?event=<id>`; once the feed loads, open that event's
   modal. (Hero/Calendar already hold the events.)
4. **`Calendar`:** "Sold Out" badge on sold-out cards.
5. **`EventForm`:** add optional **Capacity** input.
6. **`ManageShows`:** Copy-link/QR now emit `https://djkmdlegends.com/?event=<id>` (reuse
   `qrPngDataUrl` on that URL). Show `sold / capacity`; add a manual **Sold Out** toggle (PATCH).
7. **`types/event.ts`:** `soldOut?`, `capacity?`.
8. **Docs:** update `public/openapi.json`, `2-API.md`, agent runbooks (checkout endpoint, share URL, capacity/soldOut).

**Checkpoint / SHIP:** deploy worker + frontend. Buy N of a ticket type end-to-end; a Manage
Shows QR opens the event modal on the site; manual "Sold Out" hides the Buy path. **This is the
urgent quantity fix — release before Milestone B.** (Auto sold-out + roster arrive in Phase 4.)

---

## Phase 4 — Square webhook → roster + sold counter 🪝

**Goal:** purchases auto-build the roster and drive capacity.

1. **Secret + subscription:** `wrangler secret put SQUARE_WEBHOOK_SIGNATURE_KEY`; subscribe
   `payment.updated` (+ `order.updated`) → `https://djkmdlegends.com/api/square/webhook` in the
   Square dashboard.
2. **Verify util** (`square.ts`): port `verifyWebhookSignature` (HMAC-SHA256 over
   `notificationUrl + rawBody`, base64, timing-safe).
3. **Route** `POST /api/square/webhook` (public, no Bearer):
   - Read **raw** body; verify signature → 401 on mismatch.
   - Completed payments only; dedup `wh:<event_id>` + `paymentId`.
   - `GET /v2/orders/{order_id}` → `payment_note` (`<id>/<ticketType>/<qty>`), recipient
     email/phone, custom-field **name** (**re-confirm location with a sandbox test purchase** —
     fallback recipient/email).
   - Write `party:<id>:<paymentId>`; `event.sold += qty`; if `sold ≥ capacity` → `soldOut=true`,
     deactivate + clear `link:<id>:*`.
   - `200` fast; heavy work in `ctx.waitUntil`.

**Checkpoint:** a sandbox test purchase creates a named `party:*` with the right quantity;
`event.sold` rises; at capacity the show flips to sold-out and its links die; duplicate webhook
delivery doesn't double-count; bad signature → 401.

---

## Phase 5 — Multi-event check-in app 🚪

**Goal:** `/admin/checkin` → pick event (Upcoming/Previous) → check in against the auto roster.

1. **Worker (admin-gated):** `GET /api/admin/events/:id/guests` → `{ parties, checkedIn }`
   (read `party:<id>:*` + `checkin:<id>:*`); `POST`/`DELETE /api/admin/events/:id/checkin`
   (`{ paymentId }`).
2. **Frontend** (`src/components/guestlist/`): new **event-picker** landing from
   `GET /api/admin/events` (Upcoming vs collapsible Previous). Pick → roster view reusing
   `PartyList/PartyRow/CheckInModal/SearchBar`, repointed date→eventId, partyId→paymentId.
   Service in `admin-events.ts`.
3. Keep legacy `/api/guestlist/*` + `tools/ingest-guestlist.mjs` for the 2 grandfathered shows.

**Checkpoint (SHIP Milestone B):** open `/admin/checkin` → pick an upcoming event → its
auto roster loads → check a party in/out; previous events visible.

---

## Phase 6 — Secrets, deploy, docs, cleanup 🚀

1. Set `SQUARE_WEBHOOK_SIGNATURE_KEY` (prod). (Catalog/inventory scopes **not** needed — Option E
   uses only payment-links + orders, which the token already has.)
2. Deploy worker + frontend; smoke test prod (capacity-2 throwaway show → buy 2 → sold out →
   roster + check-in → delete).
3. Update `public/openapi.json`, `docs/v0.2/event_form/2-API.md`, `docs/agents/*`.
4. Optional cleanup: the 2 v0.2 shows' stored static `checkoutUrl`s are now vestigial (site uses
   the stepper) — leave them; harmless.

---

## File inventory

**Worker:** `types.ts`, `validation.ts`, `index.ts` (create/patch/delete trim, **checkout route**,
**webhook route**, guests + check-in routes, public mapper), `services/square.ts`
(custom field on link, webhook-verify).
**Frontend:** `types/event.ts`, `components/marketing/{Calendar,TicketModal}`,
`components/admin/{EventForm,ManageShows}`, `app/App.tsx` (deep link),
`components/guestlist/*` (event picker), `services/*` (checkout + check-in).
**Config/docs:** `worker/.dev.vars.example` (+`SQUARE_WEBHOOK_SIGNATURE_KEY`),
`public/openapi.json`, `2-API.md`, `docs/agents/*`.

## Risk notes

- **Name retrieval** is the one carried-over unknown — re-confirm with a real sandbox purchase in
  Phase 4 before relying on names; fallback to recipient email/phone.
- **Webhook raw body:** verify over the *exact* received bytes.
- **Public checkout endpoint** mints Square links — caching per `(type, qty)` bounds it;
  abandoned-cart orphan links are harmless.
- **Backward compatible:** the 2 quick_pay shows + 2 legacy calendar shows keep working; new
  purchases everywhere use the stepper/checkout flow.
- **Milestone A delivers quantity without the webhook;** automatic sold-out + auto-guestlist need
  Phase 4. A manual Sold-Out toggle covers the interim.
