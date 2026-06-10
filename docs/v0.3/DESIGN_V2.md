# v0.3 — DESIGN V2 (post-spike): Quantity, Capacity, Auto-Guestlist, Multi-Event Check-in

**Status:** Draft for review. Supersedes `1-DESIGN.md` after the Phase 0 spike.
**Spike result (see `2-MVP-IMPLEMENTATION.md`):** API-created payment links — `quick_pay`
*and* order/catalog — show **no buyer quantity selector**; it's dashboard-only. So
catalog items don't buy us anything. This design uses **Option E: our own quantity UI +
dynamic, on-demand `quick_pay` links**, with sharing/QR pointing at a **site URL**.

## 1. Goals (unchanged)

0. **Buy N tickets** in one checkout.
1. **Capacity / sold-out:** per-show `capacity`; at capacity show **"Sold Out"** (still
   listed) and kill the checkout. Small oversell explicitly OK.
2. **Auto-build the guestlist** from purchases (Square webhooks) — no CSV.
3. **Multi-event check-in:** pick an event (Upcoming / Previous), check people in against
   the auto roster.

## 2. The core idea (Option E)

The buyer picks quantity on **our** UI; Square is just the processor for a
correctly-priced charge.

- **No Square calls at create time.** An event just stores ticket *configs*
  (`{ticketType, priceCents}`) + `capacity` + image. (Big simplification vs v0.2, which
  minted a link per ticket up front.)
- **Checkout is dynamic.** When a buyer clicks Buy for *N* of a ticket type, the worker
  **mints (and caches) a `quick_pay` link priced `N × unit`** and redirects. quick_pay's
  lack of a quantity selector no longer matters — *we* set the quantity.
- **Sharing/QR → site URL.** Shareable links/QRs point at
  `https://djkmdlegends.com/?event=<id>`, which opens that event's ticket modal **with the
  stepper** — branded, quantity-capable, and stable even as Square links rotate.
- **Capacity** is our own counter (`sold`, incremented by the webhook); checked before
  minting. **Sold-out** kills the cached links and flips the site label.

```
SHARE/QR ─► djkmdlegends.com/?event=<id> ─► ticket modal (our quantity stepper)
                                               │ Buy (ticketType, N)
                                               ▼
                         POST /api/events/:id/checkout
                           capacity gate (sold < capacity?)
                           mint/reuse quick_pay link priced N×unit (+ name custom field)
                           → { checkoutUrl } → redirect buyer to Square
                                               │ payment.updated COMPLETED
                                               ▼
                         POST /api/square/webhook (signed)
                           party:<id>:<paymentId> = {name, qty, ticketType, …}
                           event.sold += qty;  if sold ≥ capacity → soldOut + deactivate links
```

## 3. Data model

`EventRecord` (`worker/src/types.ts`):
- `tickets: { ticketType: string; priceCents: number }[]` — just config now (drop the
  per-ticket `checkoutUrl`/`squarePaymentLinkId`; keep them **optional** so the 2 existing
  v0.2 shows still read).
- `capacity: number | null`
- `sold: number` (default 0)
- `soldOut: boolean` (set when `capacity != null && sold ≥ capacity`, or manually)

KV (existing namespaces):
- `event:<id>` — the record.
- `link:<id>:<ticketType>:<qty>` → `{ checkoutUrl, squarePaymentLinkId }` — **link cache**
  (≤ maxQty per type; lazily minted, reused; cleared on price/ticket PATCH; deactivated on
  delete/sold-out).
- `party:<id>:<paymentId>` → `{ firstName, lastName, email, phone, quantity, ticketType, purchasedAt }` (GUESTLIST ns).
- `checkin:<id>:<paymentId>` → `{ checkedInAt }`.
- `wh:<square_event_id>` → webhook idempotency marker (short TTL).

## 4. Endpoints

| Method & path | Auth | Purpose |
| --- | --- | --- |
| `POST /api/events/:id/checkout` | public | **New.** Body `{ ticketType, quantity }`. Capacity-gates, mints/reuses a `quick_pay` link priced `N×unit` (+ name custom field, `payment_note: legends-event:<id>:<ticketType>:<qty>`), returns `{ checkoutUrl }`. |
| `GET /api/events` | public | Feed; now exposes `soldOut` per event (and `tickets[].priceCents` for the stepper). |
| `GET /api/events/:id/image` | public | Image (unchanged). |
| `POST /api/square/webhook` | signed | **New.** Build roster + bump `sold` + sold-out. |
| `POST /api/admin/events` | admin | Create — **no Square calls** now; stores config + image. |
| `GET/PATCH/DELETE /api/admin/events[/:id]` | admin | Manage; PATCH adds `capacity`/`soldOut`; clears link cache on price change; DELETE deactivates cached links. |
| `GET /api/admin/events/:id/guests` | admin | **New.** Auto roster + check-in state for the check-in app. |
| `POST/DELETE /api/admin/events/:id/checkin` | admin | **New.** Check a party in/out (`{ paymentId }`). |

## 5. Checkout endpoint detail (`POST /api/events/:id/checkout`)

Public (buyers hit it). Steps:
1. Load event; find `ticketType`; validate `quantity` ∈ 1..`MAX_QTY` (e.g. 20).
2. **Capacity gate:** if `capacity != null && sold ≥ capacity` → `409 { error: "Sold out" }`.
   (We don't reject `quantity > remaining` — small oversell is accepted.)
3. **Link cache:** read `link:<id>:<ticketType>:<qty>`. If present, return its `checkoutUrl`.
4. Else `createPaymentLink` (`quick_pay`, `price = qty × unit`, `name = "<ticketType> × <qty> · <Mon D, YYYY, h:mm A> · <venue>"`, `custom_fields: [{title:"Full name (for the guest list)"}]`, `payment_note: legends-event:<id>:<ticketType>:<qty>`, `redirect_url`). Cache + return.

Abuse note: this public endpoint creates Square links; caching per `(type, qty)` bounds it
to ≤ `MAX_QTY` links per ticket type. Abandoned-cart orphans are inherent and harmless.

## 6. Webhook (`POST /api/square/webhook`)

Public, **signature-authenticated** (no Bearer). Port `verifyWebhookSignature` from
`reference_repos/LeaseKitAI-webapp/.../services/square.ts` (HMAC-SHA256 over
`notificationUrl + rawBody`, base64, timing-safe).
1. Verify signature → 401 on mismatch. Read **raw** body (exact bytes).
2. Completed payments only; dedup on `event_id` + `paymentId`.
3. `GET /v2/orders/{order_id}` → `payment_note` → `<eventId>/<ticketType>/<qty>`;
   `fulfillment.recipient` (email/phone); **custom-field name** (see Spike #1 risk below).
4. Write `party:<id>:<paymentId>`; `event.sold += qty`; if `sold ≥ capacity` → set
   `soldOut`, deactivate all `link:<id>:*` (belt-and-braces) + clear the cache.
5. Return `200` fast (`ctx.waitUntil` the order fetch / writes).

**Name source (open risk, carry from spike):** the spike confirmed the custom field
*renders*, but where its response is readable via API is still unverified. **Implementation
re-confirms this with a real sandbox test purchase**; fallback = order `fulfillment.recipient`
(email/phone) → an email/phone door list if names aren't retrievable.

## 7. Frontend

- **Deep link** (`src/app/App.tsx` + Calendar/Hero): on load, read `?event=<id>`; once the
  feed loads, open that event's `TicketModal`.
- **`TicketModal`:** per ticket type → **quantity stepper** + unit price + a **Buy** button
  that `POST`s `/api/events/:id/checkout` and redirects to the returned `checkoutUrl`. Show a
  disabled **"Sold Out"** when `event.soldOut`. (Legacy calendar events still use the old
  `parseDescription` single-link path.)
- **`Calendar`:** "Sold Out" badge on sold-out cards (still listed).
- **`EventForm`:** add a **Capacity** input (optional). Tickets stay `{ticketType, price}`.
- **`ManageShows`:** **Copy link / QR now emit `https://djkmdlegends.com/?event=<id>`** (the
  site deep link, not a Square link). Show `sold / capacity` (remaining) and a manual
  **Sold Out** toggle (PATCH).
- **`types/event.ts`:** add `soldOut?`, `capacity?`; `tickets[]` keep `priceCents`.

## 8. Multi-event check-in app (`src/components/guestlist/`)

- **Event picker landing:** `GET /api/admin/events` → **Upcoming** (`endTime ≥ now`) +
  collapsible **Previous events** (history). Always shown.
- **Roster view:** `GET /api/admin/events/:id/guests` → `{ parties, checkedIn }` (auto-built).
  Reuse `PartyList/PartyRow/CheckInModal/SearchBar`, repointed date→eventId, partyId→paymentId.
- Legacy `/api/guestlist/*` + CSV tool stay for the 2 grandfathered shows.

## 9. What got simpler vs the catalog design

- **No catalog/inventory objects, no lifecycle sync.** Create/patch/delete barely change
  (create makes **zero** Square calls).
- **Capacity = a counter,** not Square inventory.
- The only genuinely new pieces are the **checkout endpoint**, the **webhook**, the
  **stepper + deep link**, and the **check-in rework**.

## 10. Open decisions / risks

1. **Name retrieval** (carry-over): re-confirm in a sandbox *purchase* during impl; fallback
   to recipient email/phone.
2. **Per-show vs per-type capacity:** MVP = one total per show (`sold` sums all types).
3. **Refunds** don't free capacity in MVP (oversell tolerance covers it).
4. **Deep-link UX:** MVP opens the modal on the homepage via `?event=<id>`. A dedicated
   `/shows/:id` page (richer OG preview for shared links) is a fast-follow.
5. **Existing v0.2 shows:** the 2 Rat Pack shows switch to the stepper flow automatically
   (their old static links keep working); no migration needed.

## 11. Acceptance criteria

- [ ] A buyer can choose a quantity and check out for N tickets (correct total).
- [ ] Shared link / QR opens the event on-site with the stepper.
- [ ] `capacity` stored; at capacity the show reads **Sold Out** and the checkout link(s) die.
- [ ] Each completed purchase auto-adds a named party (with quantity) to the event roster.
- [ ] `/admin/checkin` lists events (Upcoming + Previous) and checks people in — no CSV.
- [ ] Webhook verifies signatures and is idempotent.
