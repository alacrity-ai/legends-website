# v0.3 — Quantity, Capacity, Auto-Guestlist & Multi-Event Check-in · DESIGN (MVP)

**Status:** Draft for review (precedes `2-IMPLEMENTATION.md`).
**Builds on:** v0.2 events (`docs/v0.2/event_form/`). Extends `docs/v0.3/capacity/0-TODO.md`.

## 1. Goals

0. **Buy N tickets.** A buyer must be able to purchase **multiple tickets** in one
   checkout. *(Confirmed gap: today's `quick_pay` links have no quantity selector —
   you can only buy 1 at a time. Dealbreaker for group/dinner sales.)*
1. **Capacity / sold-out.** Each show gets a `capacity`. At capacity: show the card
   as **"Sold Out"** (still listed) and **stop sales** on the Square link(s). A small
   oversell is **explicitly acceptable** (user: "+10 over is fine") — so we don't need
   perfect enforcement.
2. **Auto-build the guestlist** from purchases via **Square webhooks** — removing the
   manual CSV export/ingest (`tools/ingest-guestlist.mjs`).
3. **Multi-event check-in.** Opening `/admin/checkin` should **prompt you to pick an
   event** (Upcoming + a "Previous events" history section), then show that event's
   auto-built roster.

## 2. Research findings that drive the design

Grounded in Square's docs (sources at end). The decisive ones:

- **F1 — quantity requires catalog items, not quick_pay.** "The only checkout link
  that will display a quantity selector to your customers is the **Sell an item**
  option… [it] is limited for Quick Pay." So Goal 0 forces a move **off `quick_pay`**
  to **catalog-item-backed** payment links (an `order` with a `catalog_object_id`
  line item).
- **F2 — catalog line items auto-sync inventory.** A `catalog_object_id` line item
  "automatically updates your inventory when the Order is closed or charged." So if we
  set a variation's stock = `capacity`, **Square tracks remaining seats for us** — this
  is our capacity mechanism (no separate counter needed).
- **F3 — we can collect the attendee name via a custom field.** `checkout_options.custom_fields`
  allows up to **two** buyer-entered fields. We add **"Full name (for the guest list)."**
  Email + phone also land in the order's `fulfillment.recipient` after checkout.
- **F4 — webhooks fire on payment-link sales.** Completed sales emit `payment.updated`
  (`COMPLETED`) and `order.updated`; verify with the subscription's `signature_key`
  (HMAC-SHA256 over `notificationUrl + rawBody`). We have working verification to copy
  (`reference_repos/LeaseKitAI-webapp/.../services/square.ts` → `verifyWebhookSignature`).

### ⚠️ The make-or-break unknown (Spike #0)
Square's docs are **ambiguous about whether an API-created payment link shows the
buyer a quantity selector** — the selector is documented for *dashboard* "Sell an
item" links, and one API doc says order-checkout's buyer experience is "identical to
quick pay." **Before any implementation, run a sandbox spike:** create a payment link
from an `order` referencing a catalog variation, open the hosted checkout, and confirm
(a) the buyer can change quantity and (b) inventory blocks/decrements at 0. If the
selector does **not** appear on API links, none of the quantity plan works as drawn —
see §10 fallbacks. **This gates the whole feature.**

## 3. MVP scope

**In:** move ticket types to Square **catalog items + variations**; **order-based
payment links** with a buyer **quantity selector**; **inventory stock = capacity**
(native-ish sold-out); **custom field** for attendee name; **Square webhook** →
auto-built per-event roster (party = name + quantity + ticket type); **"Sold Out"** on
the site; **check-in app** reworked to an event picker (Upcoming / Previous) over the
auto roster.

**Out (fast-follow / noted):** refunds freeing capacity / re-opening a sold-out show;
per-ticket-type capacity (MVP = one total per show via summed variation stock, or one
variation if single type); migrating the 2 grandfathered CSV shows (keep the CSV tool
for them); taxes/fees.

## 4. Architecture

```
CREATE show (admin) ─► Worker:
   for each ticket type → upsert Catalog Item+Variation (price)
                         → set inventory stock = capacity
                         → create order-based Payment Link (catalog line item) + custom name field
   store catalog/variation/link ids on the event record

BUYER checks out (picks quantity) ─► Square charges, decrements inventory
        │ payment.updated COMPLETED  (+ order.updated)
        ▼
Square ──webhook──► POST /api/square/webhook
        verify signature · dedup by event_id/payment_id
        fetch Order → payment_note "legends-event:<eventId>:<ticketType>",
                      line_item quantity, recipient (email/phone), custom-field name
        ▼
   KV: party:<eventId>:<paymentId> = {name, qty, ticketType, email, phone}
   remaining = Square inventory (or capacity − Σqty)
        └─ if remaining ≤ 0 → set soldOut, deactivate the event's links (belt & braces)

GET /api/events → soldOut → site shows "Sold Out"
/admin/checkin  → pick event → auto-built party roster → check in
```

## 5. Data model

`EventRecord` (`worker/src/types.ts`):
- `capacity: number | null`
- `soldOut: boolean` (manual-settable too)
- each `tickets[]` entry gains Square catalog refs: `catalogItemId`, `catalogVariationId`
  (alongside the existing `checkoutUrl`, `squarePaymentLinkId`, `squareOrderId`).

Guestlist (existing `GUESTLIST` KV, **keyed by event id** — mirrors today's Party shape
so the check-in UI is reused):
- `party:<eventId>:<paymentId>` → `{ firstName, lastName, email, phone, quantity, ticketType, purchasedAt }`
- `checkin:<eventId>:<paymentId>` → `{ checkedInAt }`
- `wh:<square_event_id>` → idempotency marker (short TTL).

Legacy `roster:<date>` rosters stay for the 2 grandfathered shows.

## 6. Square integration changes (`worker/src/services/square.ts`)

This is the largest change — `quick_pay` → catalog lifecycle:

- **Create:** per ticket type → `UpsertCatalogObject` (Item + ItemVariation at the
  price) → `BatchChangeInventory` to set stock = `capacity` → `CreatePaymentLink` with
  an `order` line item referencing the `catalog_object_id` + `checkout_options.custom_fields`
  (name). Store the returned ids.
- **Update (PATCH):** price change → upsert the variation's new price (or recreate
  link); `capacity` change → adjust inventory count; metadata-only → keep links.
- **Delete:** deactivate links, **delete the catalog objects**, zero/ignore inventory,
  delete the R2 image. (Catalog objects must be cleaned up so they don't accumulate.)
- **Deactivate on sold-out:** `deactivatePaymentLink()` for each link (belt-and-braces
  on top of inventory hitting 0).

> Lifecycle complexity is the real cost here: events now own Square **catalog +
> inventory** objects, not just a link. The create/patch/delete flows must keep them
> in sync. This is inherent to real ticketing with quantity + capacity.

## 7. Webhook endpoint `POST /api/square/webhook`

Public, **no Bearer** (authenticated by signature):
1. Verify `x-square-hmacsha256-signature` over `SQUARE_WEBHOOK_SIGNATURE_KEY` +
   `notificationUrl + rawBody`. 401 on mismatch.
2. Act only on **completed** payments. Dedup on Square `event_id` and `paymentId`
   (`party:<eventId>:<paymentId>` is the natural unique key).
3. `GET /v2/orders/{order_id}` → `payment_note` → `<eventId>`/`<ticketType>`; line-item
   **quantity**; `fulfillment.recipient` (email/phone); custom-field **name** (fallback:
   recipient name → email local-part).
4. Write `party:<eventId>:<paymentId>`. Recompute remaining (Square inventory read, or
   `capacity − Σ quantity`). If `≤ 0` → set `soldOut`, deactivate links.
5. Return `200` fast (Square retries non-2xx); heavy work in `ctx.waitUntil`.

## 8. Capacity & sold-out surfacing

- **Worker:** `parseEventDraft`/`parseEventPatch` accept `capacity` (positive int,
  optional). `eventRecordToPublic` exposes `soldOut` (+ `remaining` for admin). Manual
  `soldOut` toggle via PATCH.
- **Frontend** (`Calendar.tsx`, `TicketModal.tsx`, `types/event.ts`): `soldOut` → a
  disabled **"Sold Out"** button; card stays visible.
- **Form / Manage Shows:** capacity input; show sold / remaining; manual sold-out toggle.

## 9. Check-in app redesign (`src/components/guestlist/`)

Today it loads `roster:<date>` keys and auto-selects a single show. Rework to
event-centric:
- **Event picker (new landing):** events from `GET /api/admin/events` split into
  **Upcoming** (`endTime ≥ now`) and a collapsible **Previous events** section (history).
  Always shown — pick before seeing a roster.
- **Roster view:** `GET /api/admin/events/:id/guests` → `{ parties, checkedIn }`
  (auto-built). The existing `PartyList`/`PartyRow`/`CheckInModal`/`SearchBar` mostly
  carry over (they already model parties with quantity), repointed date→eventId,
  partyId→paymentId.
- **New worker endpoints (admin-gated):** `GET /api/admin/events/:id/guests`,
  `POST /api/admin/events/:id/checkin`, `DELETE …/checkin` (`{ paymentId }`).
- Legacy `/api/guestlist/*` + CSV tool remain for the 2 grandfathered shows.

Delivers the requested flow: open check-in → choose event (past ones visible) → check
people in against the auto-populated list.

## 10. Spikes, open decisions & risks

- **Spike #0 (gating): quantity + inventory on API payment links.** Confirm in sandbox
  that an order/catalog link shows a buyer quantity selector and that inventory
  decrements / blocks at 0. **If not:** fallbacks — (a) sell fixed bundles (separate
  links for "x1 / x2 / x4"), ugly; (b) keep our own counter for capacity and accept the
  quantity gap short-term; (c) escalate to Square support. Decide before building.
- **Spike #1: custom-field retrieval.** Confirm where the buyer's name response is
  readable via API (order? checkout?) and whether it can be required. Fallback: order
  `fulfillment.recipient` (email/phone) → emails-only door list.
- **Per-show vs per-type capacity:** MVP = one total per show. If multiple ticket types
  share a venue cap, summing independent variation stocks doesn't enforce a *shared*
  cap — confirm whether that matters for these shows (likely single "Dinner & Show" type).
- **Refunds:** out of MVP; a refunded seat won't free capacity. OK given oversell tolerance?
- **Catalog clutter:** deleting events must delete catalog objects; orphan-cleanup safety.

## 11. Acceptance criteria

- [ ] A buyer can purchase **multiple tickets** in one checkout.
- [ ] Create/update/get events accept & return `capacity` and `soldOut`.
- [ ] Each completed purchase auto-adds a named party (with quantity) to the event roster.
- [ ] At capacity the show reads **"Sold Out"** on the site and the Square link(s) stop selling.
- [ ] `/admin/checkin` lists events (Upcoming + Previous) and checks people in against the auto roster — no CSV step.
- [ ] Webhook verifies signatures and is idempotent under retries.

## Sources

- [Quick Pay Checkout](https://developer.squareup.com/docs/checkout-api/quick-pay-checkout) ·
  [Square Order Checkout](https://developer.squareup.com/docs/checkout-api/square-order-checkout) ·
  [Create Payment Link (API ref)](https://developer.squareup.com/reference/square/checkout-api/create-payment-link)
- Quantity selector = "Sell an item" only: [Customize Square Payment Links](https://squareup.com/help/us/en/article/8364-customize-square-payment-links) ·
  [Quantity on a checkout link? (community)](https://community.squareup.com/t5/Online-Store/Can-I-set-a-quantity-on-a-online-checkout-link/m-p/214960)
- Catalog line items sync inventory: [What is order.line_items.catalog_object_id? (forum)](https://developer.squareup.com/forums/t/what-is-order-line-items-catalog-object-id/12599) ·
  [Orders API: How It Works](https://developer.squareup.com/docs/orders-api/how-it-works)
- Custom fields + recipient: [Optional Checkout Configurations](https://developer.squareup.com/docs/checkout-api/optional-checkout-configurations)
- Webhooks: [Payments API Webhooks](https://developer.squareup.com/docs/payments-api/webhooks) ·
  [payment.updated](https://developer.squareup.com/reference/square/payments-api/webhooks/payment.updated) ·
  [order.updated](https://developer.squareup.com/reference/square/orders-api/webhooks/order.updated)
- Buyer email caveats: [Get user-provided email from payment link (forum)](https://developer.squareup.com/forums/t/get-user-provided-email-from-square-payment-link/8368)
