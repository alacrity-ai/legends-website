# Simple Ticketing Implementation

Square-hosted checkout via links embedded in Google Calendar event descriptions.

**Approach:** Keith includes a `square.link/u/...` URL in each Google Calendar event description. The site extracts it, shows the description text in a modal, and links the "Buy Now" button to Square's hosted checkout.

---

## Step 1 — Pass event description through the worker

**Files:**
- `worker/src/services/google-calendar.ts`
- `worker/src/types.ts`

**Changes:**
1. In `google-calendar.ts`, add `description` to the `fields` query parameter so the Google Calendar API returns it.
2. Add `description?: string` to the `GoogleEventItem` interface.
3. Map `item.description ?? null` into the returned event object.
4. In `worker/src/types.ts`, add `description: string | null` to the `CalendarEvent` interface.

**Acceptance criteria:**
- `GET /api/events` response includes a `description` field on each event (string or null).
- Existing fields (title, date, time, location) are unchanged.

---

## Step 2 — Update the frontend CalendarEvent type

**Files:**
- `src/types/event.ts`

**Changes:**
1. Add `description: string | null` to the `CalendarEvent` interface.

**Acceptance criteria:**
- TypeScript compiles with no errors.
- The frontend type matches the shape returned by the worker.

---

## Step 3 — Extract Square link and clean description in the TicketModal

**Files:**
- `src/components/marketing/TicketModal/TicketModal.tsx`

**Changes:**
1. Write a helper function `parseDescription(description: string | null): { text: string | null; squareUrl: string | null }` that:
   - Returns `{ text: null, squareUrl: null }` if description is null/empty.
   - Extracts the first `https://square.link/u/...` URL via regex.
   - Returns the remaining description text (with the URL line removed and trimmed) as `text`, and the extracted URL as `squareUrl`.
2. Replace the current modal body (event selector, quantity picker, price rows, "coming soon" state) with:
   - The event title as the modal heading.
   - The cleaned description text (if present), displayed as a paragraph.
   - If `squareUrl` exists: a "Buy Now" `<a>` tag styled as the primary button, linking to `{squareUrl}?src=embed`, opening in `target="_blank"`.
   - If `squareUrl` is null: the existing "coming soon" message from `ticketComingSoonMessage`.
3. Remove the `events` prop — the modal now only needs the single `selectedEvent`.
4. Remove unused imports: `ticketDefaultPrice`, `ticketCurrency`, `useState` for `quantity`/`selectedIndex`/`purchased`.

**Acceptance criteria:**
- Modal displays the event title and cleaned description (no raw URL visible).
- "Buy Now" button links to the correct Square checkout URL for that event.
- Events without a Square link show the "coming soon" fallback message.
- No quantity picker, price rows, or event selector in the modal.

---

## Step 4 — Update Calendar component to pass single event

**Files:**
- `src/components/marketing/Calendar/Calendar.tsx`

**Changes:**
1. Update the `<TicketModal>` invocation to remove the `events` prop and pass only `selectedEvent={ticketEvent}`.

**Acceptance criteria:**
- Calendar renders without errors.
- Clicking "Buy Tickets" on any event opens the modal for that specific event.

---

## Step 5 — Clean up TicketModal CSS

**Files:**
- `src/components/marketing/TicketModal/TicketModal.module.css`

**Changes:**
1. Remove unused classes: `.fieldGroup`, `.label`, `.input`, `.priceRow`, `.totalRow`, `.priceValue`, `.totalValue`, `.priceNote`.
2. Add a `.description` class for the event description text (appropriate font size, color, line-height, bottom margin).
3. Add a `.buyNowLink` class that visually matches the existing `.purchaseButton` style but applies to an `<a>` tag (display block, centered text, same colors/padding/border-radius).

**Acceptance criteria:**
- Modal is visually clean — description text is readable, "Buy Now" button matches site styling.
- No unused CSS classes remain from the old price/quantity UI.

---

## Step 6 — Remove dead code from site content

**Files:**
- `src/content/site.ts`

**Changes:**
1. Remove `ticketDefaultPrice` and `ticketCurrency` (no longer used anywhere).

**Acceptance criteria:**
- No references to `ticketDefaultPrice` or `ticketCurrency` remain in the codebase.
- Build succeeds with no errors.

---

## Summary of all files touched

| File | Action |
|---|---|
| `worker/src/types.ts` | Edit — add `description` to `CalendarEvent` |
| `worker/src/services/google-calendar.ts` | Edit — fetch and map `description` |
| `src/types/event.ts` | Edit — add `description` to `CalendarEvent` |
| `src/components/marketing/TicketModal/TicketModal.tsx` | Rewrite — Square link modal |
| `src/components/marketing/TicketModal/TicketModal.module.css` | Edit — remove old classes, add new ones |
| `src/components/marketing/Calendar/Calendar.tsx` | Edit — update TicketModal props |
| `src/content/site.ts` | Edit — remove dead exports |
