# Buy Tickets — Implementation Guide

Adds a "Buy Tickets" button to each event card that opens a placeholder ticket modal. The modal pre-selects the event from the card that was clicked, shows a dropdown of all upcoming events (from the same `/api/events` data already fetched), displays a default placeholder price, and collects basic info. No payment processing — this is a placeholder until a real ticketing solution is chosen.

**No new worker changes needed.** This is entirely frontend — reuses the events already fetched by the Calendar component.

---

## Step 1 — Ticket Modal Component

### Files to create

**`src/components/marketing/TicketModal/TicketModal.tsx`**

A modal overlay component that renders the placeholder ticket purchase flow.

**Props:**
```ts
interface TicketModalProps {
  events: CalendarEvent[];
  selectedEvent: CalendarEvent | null;
  onClose: () => void;
}
```

**Layout:**
- Dark overlay backdrop that closes the modal on click
- Centered modal panel (max-width ~480px) using `--color-surface-elevated` background
- Close button (top-right corner)
- Heading: "Get Tickets"
- Event select dropdown — populated from `events` prop, pre-selected to `selectedEvent`
  - Each option shows: `{title} — {formatted date}`
- Ticket quantity selector (default 1, max 10)
- Price display: placeholder default price (e.g. "$25.00 per ticket") with a note "(Final pricing TBD)"
- Total line: quantity x price
- "Purchase" button (primary style) — on click, shows a message: "Ticket sales coming soon! For now, please use the booking form or contact us at booking@djkmdlegends.com"
- The modal traps focus and closes on Escape key

**`src/components/marketing/TicketModal/TicketModal.module.css`**

- `.overlay` — fixed position, full viewport, semi-transparent dark background (`rgba(0,0,0,0.7)`), z-index above everything, flex centering
- `.modal` — `--color-surface-elevated` background, `--color-border` border, `--radius-lg` corners, padding, max-width 480px, max-height 90vh with overflow-y auto
- `.closeButton` — positioned top-right, minimal styling, `--color-text-muted` color
- Form elements (select, input) — reuse the same styling patterns as BookingForm (`.input` from tokens: bg, border, radius, color)
- `.priceRow` — flex row with label and value, `--color-accent` for the price
- `.totalRow` — same but bolder
- `.comingSoon` — success-style message box shown after clicking Purchase
- Responsive: modal goes full-width with margin on mobile

### Acceptance criteria
- Modal renders as an overlay on top of the page.
- Dropdown shows all events with the clicked event pre-selected.
- Quantity selector works (1-10).
- Price and total display correctly.
- "Purchase" click shows the coming-soon message (no navigation, no form submission).
- Escape key and backdrop click close the modal.
- `npx tsc -b` passes.

---

## Step 2 — Add "Buy Tickets" Button to Event Cards

### File to edit

**`src/components/marketing/Calendar/Calendar.tsx`**

Changes:
1. Add state: `const [ticketEvent, setTicketEvent] = useState<CalendarEvent | null>(null)`.
2. Inside each event card `<article>`, add a "Buy Tickets" button after the location:
   ```tsx
   <Button variant="primary" onClick={() => setTicketEvent(event)}>
     Buy Tickets
   </Button>
   ```
3. Render the `TicketModal` at the bottom of the component (outside the event list), conditionally when `ticketEvent` is not null:
   ```tsx
   {ticketEvent && (
     <TicketModal
       events={events}
       selectedEvent={ticketEvent}
       onClose={() => setTicketEvent(null)}
     />
   )}
   ```
4. Import `TicketModal` and `Button`.

**`src/components/marketing/Calendar/Calendar.module.css`**

Add a `.cardButton` style for the button inside cards — smaller padding, full width on mobile, auto width on desktop. Margin-top to space it from the location text.

### Acceptance criteria
- Each event card has a "Buy Tickets" button.
- Clicking the button opens the modal with that event pre-selected.
- Closing the modal clears the selection.
- Cards still render correctly with all existing content (title, date, location link).
- `npx tsc -b` passes.

---

## Step 3 — Placeholder Content Config

### File to edit

**`src/content/site.ts`**

Add ticket placeholder constants:

```ts
export const ticketDefaultPrice = 25;
export const ticketCurrency = '$';
export const ticketComingSoonMessage =
  'Ticket sales coming soon! For now, please use the booking form or contact us at booking@djkmdlegends.com';
```

### Acceptance criteria
- Constants are exported and used by the TicketModal (no hardcoded strings in the component).
- Easy to update when real ticketing is implemented.

---

## Step 4 — Local Test

### Actions

1. `docker compose up --build`
2. Open `http://localhost:5173`, scroll to Upcoming Shows.
3. Click "Buy Tickets" on an event card.

### Acceptance criteria
- Modal opens with the correct event pre-selected in the dropdown.
- Can switch events via dropdown.
- Quantity selector adjusts the total.
- Clicking "Purchase" shows the coming-soon message.
- Escape key closes the modal.
- Clicking the backdrop closes the modal.
- Page behind the modal is not scrollable while modal is open.
- Booking form still works (no regression).
