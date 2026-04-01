# Calendar / Upcoming Shows — Design Document

## 1. Goal

Replace the embedded Google Calendar iframe with stylized event cards fetched from the Google Calendar API. The owner manages events in `djkmd@lalalimited.com`'s Google Calendar (Google Workspace). The website renders upcoming events as branded cards showing title, date/time, and location.

---

## 2. Source of Truth

- **Google Workspace account:** `djkmd@lalalimited.com`
- **Calendar:** The primary calendar for this account (or a dedicated "Shows" calendar if preferred)
- **Calendar visibility:** Public — enables read-only access via API key (no OAuth needed)
- **Event fields used:**
  - `summary` — Event title (e.g. "Legends Annual Cher Celebration")
  - `start.dateTime` / `start.date` — Event date and time
  - `location` — Venue name and address (e.g. "Joe's Pub, 123 Happy Avenue, Chelsea MA")

---

## 3. Architecture

Same pattern as booking — the Google Calendar API key is a secret, so the worker proxies the request.

```
Browser (Calendar component)
  │
  │  GET /api/events
  ▼
Cloudflare Worker
  │
  │  GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
  │  (with API key, timeMin=now, maxResults, orderBy=startTime)
  │
  ▼
Return JSON array of { title, date, time, location }
```

### Why not call the Google API directly from the browser?

- API key would be exposed in the client bundle
- Worker lets us shape the response (only return the fields we need)
- Worker can cache responses to avoid hitting Google's rate limits on every page load

---

## 4. Requirements

### Functional

| # | Requirement |
|---|---|
| F1 | Fetch upcoming events from Google Calendar API via the worker |
| F2 | Render events as styled cards: title, date, time, location |
| F3 | Only show future events (timeMin = now) |
| F4 | Order by start time ascending (soonest first) |
| F5 | Limit to a reasonable number of events (e.g. 10) |
| F6 | Show a fallback message when there are no upcoming events |
| F7 | Show a loading state while fetching |
| F8 | Graceful error handling — show fallback link to public calendar if fetch fails |

### Non-Functional

| # | Requirement |
|---|---|
| NF1 | Google API key stored as a Cloudflare Worker secret — never in client code |
| NF2 | Worker caches the Google API response (e.g. 5-minute TTL) to reduce API calls |
| NF3 | Cards match the site's dark/gold design system |

---

## 5. Proposed Design

### 5.1 Worker — New Route: `GET /api/events`

Added to the existing `worker/src/index.ts` router.

**New files:**
```
worker/src/services/google-calendar.ts   # Google Calendar API client
worker/src/types.ts                      # Add CalendarEvent type
```

**Google Calendar API call:**
- Endpoint: `GET https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events`
- Params: `key`, `timeMin` (now as ISO string), `maxResults` (10), `orderBy=startTime`, `singleEvents=true`
- `singleEvents=true` is required to expand recurring events and enable `orderBy=startTime`

**Response shape returned to frontend:**
```ts
interface CalendarEvent {
  title: string;
  date: string;       // e.g. "2026-04-15"
  time: string | null; // e.g. "20:00" — null for all-day events
  location: string | null;
}
```

The worker transforms Google's verbose API response into this minimal shape.

**Caching:** Use the `Cache` API available in Workers. Cache the Google response for 5 minutes so repeated page loads don't each hit Google.

### 5.2 Worker Environment

| Variable | Location | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | Cloudflare Worker secret | Google Calendar API authentication |
| `GOOGLE_CALENDAR_ID` | Worker env var | Calendar ID (typically the account email) |

### 5.3 Frontend — Updated Calendar Component

**New files:**
```
src/services/events.ts              # Fetch events from worker
src/types/event.ts                  # CalendarEvent type
```

**Updated files:**
```
src/components/marketing/Calendar/Calendar.tsx          # Cards instead of iframe
src/components/marketing/Calendar/Calendar.module.css   # Card styles
```

**Component behavior:**
1. On mount, call `fetchUpcomingEvents()` from `src/services/events.ts`
2. While loading: show skeleton/spinner
3. On success with events: render event cards
4. On success with empty array: "No upcoming shows — check back soon!"
5. On error: show fallback link to public Google Calendar

**Card layout:**
```
┌─────────────────────────────────────┐
│  Legends Annual Cher Celebration    │
│  Sat, Apr 15 · 8:00 PM             │
│  Joe's Pub — 123 Happy Ave, Chelsea │
└─────────────────────────────────────┘
```

### 5.4 Config Cleanup

- Remove `VITE_GOOGLE_CALENDAR_EMBED_URL` from `.env.example` and deploy workflow (no longer embedding an iframe)
- Keep `VITE_GOOGLE_CALENDAR_PUBLIC_URL` as a fallback link (or remove if we drop the fallback)
- Remove `googleCalendarEmbedUrl` from `site.ts`

---

## 6. Google Calendar Setup (Manual)

1. Go to Google Calendar settings for `djkmd@lalalimited.com`
2. Under the target calendar, set **Access permissions** → "Make available to public"
3. Copy the **Calendar ID** (usually the email address, e.g. `djkmd@lalalimited.com`)
4. In Google Cloud Console, create an API key restricted to the Google Calendar API
5. Store the API key as a Cloudflare Worker secret: `wrangler secret put GOOGLE_API_KEY`
6. Add the Calendar ID to `wrangler.toml` as a `[vars]` entry

---

## 7. Implementation Steps

### Step 1 — Google Calendar API Client (Worker)

- Add `CalendarEvent` type to `worker/src/types.ts`
- Create `worker/src/services/google-calendar.ts` — fetches and transforms events
- Add `GOOGLE_API_KEY` and `GOOGLE_CALENDAR_ID` to `Env` type

### Step 2 — Worker Route

- Add `GET /api/events` handler to `worker/src/index.ts`
- Implement caching (5-min TTL via Cache API)
- Add CORS support for GET

### Step 3 — Frontend Service and Types

- Create `src/types/event.ts` with `CalendarEvent`
- Create `src/services/events.ts` with `fetchUpcomingEvents()`

### Step 4 — Calendar Component Rewrite

- Replace iframe with fetch-and-render cards
- Loading, empty, and error states
- Card styling matching site design system

### Step 5 — Config Cleanup

- Remove iframe-related env vars and config
- Add `GOOGLE_CALENDAR_ID` to `wrangler.toml` vars
- Update `.env.example`, deploy workflow, README

### Step 6 — Deploy & Verify

- Set `GOOGLE_API_KEY` secret via wrangler
- Deploy worker + site
- Verify events render from the live calendar

---

## 8. Resolved Decisions

| # | Decision | Resolution |
|---|---|---|
| Q1 | Calendar account | `djkmd@lalalimited.com` (Google Workspace) |
| Q2 | Auth method | Public calendar + API key (no OAuth) |
| Q3 | Event fields | title (`summary`), date/time (`start`), location (`location`) |
| Q4 | Rendering | Styled cards, not iframe embed |
| Q5 | Worker route | `GET /api/events` on existing worker |
