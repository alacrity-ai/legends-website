# v0.3 TODO — Event Capacity / Sold-Out handling

**Status:** Not started — planning stub.
**Problem:** Events have no capacity field, so we can oversell a show past the
venue's limit. Add a capacity and stop sales (and visibly mark "Sold Out") once
it's reached.

## Desired behavior

1. **Add a `capacity` field** to event create + update (API and the admin form).
2. When **tickets sold ≥ capacity**:
   - **Site:** keep showing the show, but replace the Buy button(s) with a
     **"Sold Out"** state (greyed, non-clickable).
   - **Square:** **deactivate the payment link(s)** so a direct/shared link (or a
     printed QR) can no longer be used to buy. We already have
     `deactivatePaymentLink()` — call it on sell-out.

## The hard part: where does "tickets sold" come from?

Square **quick_pay payment links have no built-in inventory/capacity** — Square
will happily keep taking payments past any number we have in mind. So capacity
**cannot be enforced by Square as configured today**; we must track the sold
count ourselves and proactively deactivate the link. Options to get sold counts:

- **A — Square webhooks (recommended).** Subscribe to `payment.updated` /
  `order.updated`, verify the signature, and increment a per-event sold counter
  in KV. Near-real-time; this also unlocks auto-building the guestlist roster
  (currently a manual CSV ingest — see `tools/ingest-guestlist.mjs`). The
  reference repo already has working signature verification to copy:
  `reference_repos/LeaseKitAI-webapp/apps/api/src/services/square.ts`
  (`verifyWebhookSignature`), and our `payment_note` is already
  `legends-event:<eventId>:<ticketType>` for correlation.
- **B — Poll the Square Orders API** on a Worker cron trigger (e.g. every few
  minutes): search orders for the location and tally by `payment_note`. Simpler
  (no public webhook endpoint) but laggy and more API calls.
- **C — Square Catalog items + inventory.** Move off `quick_pay` to catalog
  items with tracked stock; Square then enforces stock at checkout. The "correct"
  solution but a real refactor of `worker/src/services/square.ts` and the create
  flow. Consider if we want Square-native enforcement instead of our own counter.

**Note the race:** with A or B we enforce *after the fact* — between two
concurrent buyers and our deactivate call, a small oversell is possible. Acceptable
with a buffer (e.g. deactivate at capacity − N), or solved properly by option C.

## Open decisions

1. **Granularity:** one total capacity per show, or per ticket type? (Venue limit
   suggests **total show capacity**, with all ticket types counting toward it.
   Per-type adds complexity — confirm.)
2. **Sold-count source:** A / B / C above. (Lean A — webhooks — as it also feeds
   the guestlist.)
3. **Re-opening:** if capacity is raised later (or a refund frees a seat), do we
   recreate/re-activate links? Deactivated Square links can't be re-enabled —
   we'd mint fresh ones (new URLs/QRs). Document the operator expectation.
4. **Manual override:** admin ability to force "Sold Out" or set/adjust capacity
   and the counter from Manage Shows.

## Sketch of the work (once decisions are made)

- **Data model** (`worker/src/types.ts`): add `capacity: number | null` and a
  cached `soldCount: number` (and/or `soldOut: boolean`) to `EventRecord`.
- **Validation** (`worker/src/validation.ts`): accept/validate `capacity` in
  `parseEventDraft` and `parseEventPatch` (positive integer, optional).
- **Sold tracking:** new webhook route `POST /api/square/webhook` (verify sig →
  update KV counter), or a cron poller. On reaching capacity, call
  `deactivatePaymentLink()` for the show's links and set `soldOut`.
- **Public feed** (`worker/src/index.ts` `eventRecordToPublic`): expose
  `soldOut` (and maybe `remaining`) per event/ticket.
- **Frontend** (`Calendar.tsx`, `TicketModal.tsx`): render a "Sold Out" state
  instead of Buy when `soldOut`.
- **Admin form + Manage Shows:** capacity input; show sold/remaining; manual
  sold-out toggle.
- **Config:** add the Square webhook signature key as a Worker secret; register
  the webhook subscription in the Square dashboard.
- **Docs:** update `public/openapi.json`, `docs/v0.2/event_form/2-API.md`, and
  the agent runbooks (`docs/agents/`) with the new `capacity`/`soldOut` fields.

## Acceptance criteria

- [ ] Create/update accept `capacity`; it's stored and returned by the GET endpoints.
- [ ] Reaching capacity flips the show to "Sold Out" on the site (still listed).
- [ ] Reaching capacity deactivates the Square link(s) so direct links/QRs can't buy.
- [ ] Operator can see sold/remaining and adjust capacity.
