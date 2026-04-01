# Calendar / Upcoming Shows — Implementation Guide

Deterministic, step-by-step execution plan. Follow in order.

**Prerequisites:**
- Google Calendar is public for `djkmd@lalalimited.com`
- Google API key created, restricted to Google Calendar API
- `GOOGLE_API_KEY` set as Cloudflare Worker secret
- `GOOGLE_CALENDAR_ID` added to `wrangler.toml` vars
- `GOOGLE_API_KEY` added to `worker/.dev.vars` for local dev

---

## Step 1 — Worker Types

### Files to edit

**`worker/src/types.ts`**

Add to the existing file:

- `CalendarEvent` type:
  ```ts
  interface CalendarEvent {
    title: string;
    date: string;         // "2026-04-15"
    time: string | null;  // "20:00" or null for all-day events
    location: string | null;
  }
  ```

- Add `GOOGLE_API_KEY` and `GOOGLE_CALENDAR_ID` to the `Env` interface.

### Acceptance criteria
- `npx tsc --noEmit` passes from `worker/`.
- `Env` includes both new bindings.

---

## Step 2 — Google Calendar API Client

### File to create

**`worker/src/services/google-calendar.ts`**

An isolated client that fetches events from the Google Calendar API and transforms them into `CalendarEvent[]`.

**Function signature:**
```ts
export async function fetchUpcomingEvents(
  apiKey: string,
  calendarId: string,
  maxResults?: number,
): Promise<CalendarEvent[]>
```

**Implementation:**
- `GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`
- Query params:
  - `key` = apiKey
  - `timeMin` = current time as ISO 8601 string (RFC3339, e.g. `2026-04-01T00:00:00Z`)
  - `maxResults` = 10 (default)
  - `orderBy` = `startTime`
  - `singleEvents` = `true` (required to expand recurring events and enable `orderBy=startTime`)
  - `eventTypes` = `default` (excludes focusTime, outOfOffice, workingLocation, birthday, fromGmail)
  - `fields` = `items(summary,start,location,status)` (limits response to only the fields we need — reduces payload size)
- Parse the response `items` array. For each item:
  - Skip items where `item.status === "cancelled"`
  - Extract `title` from `item.summary` (fallback: `"Untitled Event"`)
  - Extract `date` from `item.start.dateTime` or `item.start.date`:
    - `start.dateTime` is RFC3339 format (e.g. `"2026-04-15T20:00:00-04:00"`) — parse out the date portion
    - `start.date` is `"yyyy-mm-dd"` format for all-day events
  - Extract `time` from `item.start.dateTime` (parse out `HH:mm`) or `null` for all-day events (`start.date` only)
  - Extract `location` from `item.location` (free-form string) or `null` if absent
- Return the array of `CalendarEvent` objects.
- On non-200 response, throw with the error message from the response body.

### Acceptance criteria
- Function fetches from the correct Google Calendar API endpoint.
- Handles both timed events (`start.dateTime`) and all-day events (`start.date`).
- Returns `CalendarEvent[]` matching the type from Step 1.
- Does not import or depend on any booking-related code.
- `npx tsc --noEmit` passes.

---

## Step 3 — Worker Route: GET /api/events

### File to edit

**`worker/src/index.ts`**

Add a `GET /api/events` route to the existing worker.

**Changes:**

1. Import `fetchUpcomingEvents` from `./services/google-calendar.ts`.
2. Update the routing logic:
   - Current: only handles `POST /api/booking`, returns 404 for everything else.
   - New: also handle `GET /api/events`. Return 405 if method doesn't match the route.
3. `GET /api/events` handler:
   - Call `fetchUpcomingEvents(env.GOOGLE_API_KEY, env.GOOGLE_CALENDAR_ID)`.
   - On success: return `200 { events: CalendarEvent[] }`.
   - On failure: `console.error` the detail, return `500 { error: "Failed to fetch events" }`.
4. Update `getCorsHeaders` to allow `GET` in `Access-Control-Allow-Methods`.
5. **Caching:** Set `Cache-Control: public, max-age=300` on the events response (5-minute browser/CDN cache). This is simpler than using the Workers Cache API and achieves the same goal — repeated page loads within 5 minutes don't re-fetch from Google.

### Acceptance criteria
- `GET /api/events` returns `200` with `{ events: [...] }`.
- `POST /api/events` returns `405`.
- `GET /api/booking` returns `405`.
- Existing `POST /api/booking` still works unchanged.
- `OPTIONS` preflight works for both routes.
- Response includes `Cache-Control: public, max-age=300`.
- Google API errors return `500` with a generic message.
- `npx tsc --noEmit` passes.

---

## Step 4 — Frontend Types and Service

### Files to create

**`src/types/event.ts`**

```ts
export interface CalendarEvent {
  title: string;
  date: string;
  time: string | null;
  location: string | null;
}
```

**`src/services/events.ts`**

```ts
export async function fetchUpcomingEvents(): Promise<CalendarEvent[]>
```

- Reads the worker URL from `import.meta.env.VITE_BOOKING_API_URL` (same base URL as booking).
- `GET`s `{url}/api/events`.
- Parses response JSON, returns `events` array.
- Throws on non-2xx or network error.

### Acceptance criteria
- Exports the function and re-exports `CalendarEvent` type (or imports from `types/event.ts`).
- URL comes from the same env var as booking — no new env var needed.
- Throws on failure.
- `npx tsc -b` passes.

---

## Step 5 — Calendar Component Rewrite

### Files to edit

**`src/components/marketing/Calendar/Calendar.tsx`**

Complete rewrite. Replace the iframe embed with a fetch-and-render card layout.

**Component behavior:**
1. `useState` for `events` (array), `loading` (boolean), `error` (boolean).
2. `useEffect` on mount: call `fetchUpcomingEvents()`, set state accordingly.
3. **Loading state:** Show a brief loading indicator (e.g. "Loading upcoming shows..." text).
4. **Error state:** Show the fallback message with a link to the public Google Calendar URL.
5. **Empty state:** "No upcoming shows — check back soon!"
6. **Events state:** Render a list of event cards.

**Card markup per event:**
```
<article>
  <h3>{title}</h3>
  <p>{formatted date} · {formatted time}</p>   ← e.g. "Sat, Apr 15 · 8:00 PM"
  <p>{location}</p>                             ← only if location is present
</article>
```

**Date/time formatting:**
- Format the `date` string ("2026-04-15") into a readable form: "Sat, Apr 15"
- Format the `time` string ("20:00") into 12-hour: "8:00 PM"
- If `time` is null (all-day event), show just the date without a time
- Use `Intl.DateTimeFormat` for formatting — no libraries needed

**Imports:** Keep `googleCalendarPublicUrl` from `site.ts` for the error/fallback link. Remove `googleCalendarEmbedUrl` import.

**`src/components/marketing/Calendar/Calendar.module.css`**

Complete rewrite. Replace iframe styles with card layout styles.

**Card styling:**
- Cards use `--color-surface-elevated` background (`#1d1823`)
- `--color-border` border
- `--radius-md` border radius
- Title in `--color-text` (`#f5f0e6`)
- Date/time in `--color-accent` (`#d4af37`)
- Location in `--color-text-muted` (`#bfb5a3`)
- Cards stack vertically with `--space-lg` gap
- Max-width to keep cards readable (not full-bleed)
- Responsive: full width on mobile, constrained on desktop

### Acceptance criteria
- No iframe or embed code remains in the component.
- Component fetches events from the worker on mount.
- Loading, empty, error, and populated states all render correctly.
- Cards show title, formatted date/time, and location.
- All-day events render without a time.
- Events with no location omit the location line.
- Styles use existing CSS variables from `tokens.css`.
- `npx tsc -b` passes.

---

## Step 6 — Config Cleanup

### Files to edit

**`src/content/site.ts`**
- Remove `googleCalendarEmbedUrl` export and its `VITE_GOOGLE_CALENDAR_EMBED_URL` env reference.
- Keep `googleCalendarPublicUrl` (used as fallback link in error state).
- Keep `calendarCopy` and `sectionIds.calendar`.

**`.env.example`**
- Remove `VITE_GOOGLE_CALENDAR_EMBED_URL`.
- Keep `VITE_GOOGLE_CALENDAR_PUBLIC_URL` (fallback link).

**`.github/workflows/deploy.yml`**
- Remove `VITE_GOOGLE_CALENDAR_EMBED_URL` from the build env block.
- Keep `VITE_GOOGLE_CALENDAR_PUBLIC_URL`.

**`worker/.dev.vars.example`**
- Already updated by user to include `GOOGLE_API_KEY`. No changes needed.

**`README.md`**
- Remove `VITE_GOOGLE_CALENDAR_EMBED_URL` from the frontend env vars table.

### Acceptance criteria
- No references to `googleCalendarEmbedUrl` or `VITE_GOOGLE_CALENDAR_EMBED_URL` remain in `src/` or config files.
- `googleCalendarPublicUrl` still exists for fallback.
- Build passes: `npm run build`.

---

## Step 7 — Local Test

### Actions

1. Ensure `worker/.dev.vars` contains the real `GOOGLE_API_KEY`.
2. Add at least one future event to the Google Calendar (with title, time, and location).
3. `docker compose up --build`
4. Open `http://localhost:5173`, scroll to Upcoming Shows.

### Acceptance criteria
- Event cards render with correct title, date/time, and location from the Google Calendar.
- No iframe visible.
- Loading state appears briefly before cards load.
- If no events exist, "No upcoming shows" message displays.

---

## Step 8 — Deploy & Verify

### Actions (manual)

1. `GOOGLE_API_KEY` already set as worker secret (done in prerequisites).
2. Deploy worker: `cd worker && npx wrangler deploy`.
3. Deploy site via GitHub Actions workflow.
4. Verify on the live site that upcoming shows render as cards.
5. Add/remove an event in Google Calendar — verify it appears/disappears within 5 minutes (cache TTL).

### Acceptance criteria
- Live site shows event cards fetched from Google Calendar.
- No Google API key visible in browser network tab or page source.
- Cards match the site's dark/gold design aesthetic.
- Booking form still works (no regression).
