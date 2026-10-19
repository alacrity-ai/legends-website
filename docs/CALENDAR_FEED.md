# Calendar feed — subscribe + "Add to calendar" (LGD-41)

**Status:** shipped 2026-10-19 on top of the show calendar (LGD-40, `SHOW_CALENDAR_PAGE.md`).
**Feed:** https://djkmdlegends.com/api/calendar.ics

---

## 1. Why

"Do you have an online calendar?" sometimes means *a page I can look at* (LGD-40) and
sometimes *shows in my own calendar*. This is the second: one subscription puts every
Legends show on a fan's phone, and new shows appear by themselves; or they add a single
show with two taps.

## 2. What the visitor gets

| Where | Control | Choices |
|---|---|---|
| `/calendar`, intro band | **Subscribe to this calendar** | **Google Calendar** → Google's "add calendar from URL" page with the feed preloaded · **Apple Calendar / Outlook** → a `webcal://` link that opens the device's calendar app on its subscribe sheet · **Copy feed link** → the `https://` feed URL on the clipboard, for any app that subscribes by URL. The raw feed URL is shown under the choices |
| Each show card | **Add to calendar** | **Google Calendar** → Google's prefilled "create event" page (title, Eastern times, venue, description, ticket link) · **Apple Calendar, Outlook & others** → downloads a one-show `.ics` file |

Cancelled shows have no *Add to calendar* (nothing to add); subscribers see them struck
through instead (below).

## 3. The feed

`GET /api/calendar.ics` (worker, `src/calendar-feed.ts`) — `text/calendar; charset=utf-8`,
`Cache-Control: public, max-age=300`, served on the same hosts as the rest of `/api/*`.

- **Window:** every show whose end is later than 30 days ago, earliest first. Keeping the
  recent past means a subscriber's week does not lose last Saturday overnight; calendar apps
  only ever show what the feed contains.
- **Calendar properties:** `METHOD:PUBLISH`, `X-WR-CALNAME: DJKMD Legends Shows`,
  `X-WR-TIMEZONE: America/New_York`, `REFRESH-INTERVAL` / `X-PUBLISHED-TTL` of six hours
  (Apple and Outlook honour it; Google polls on its own schedule, typically every 12–24 h).
- **One `VEVENT` per show:** `UID <eventId>@djkmdlegends.com` (stable, so edits update
  rather than duplicate), `DTSTART`/`DTEND` in UTC converted from the record's offset time,
  `SUMMARY "<show> — DJKMD Legends"`, `LOCATION "<venue>, <address>"`, `DESCRIPTION` =
  the show's description + ticket prices (or *Sold out.*) + the `/calendar?event=<id>`
  link, `URL` the same link, `STATUS:CONFIRMED`, `SEQUENCE:0`, `LAST-MODIFIED` = created.
- **Cancelled show:** stays in the feed with `STATUS:CANCELLED`, `SEQUENCE:1`,
  `SUMMARY "CANCELLED: …"` and `LAST-MODIFIED` = cancelled-at. That is the iCalendar way to
  tell a subscribed calendar to strike the event; dropping it from the feed would make it
  vanish without explanation.
- **Text rules:** RFC 5545 escaping (`\,` `\;` `\n`), CRLF line endings, lines folded at
  75 octets (UTF-8 aware; a line of accented text never splits a character). These live in
  `src/ics.ts`, shared with the ticket-confirmation attachment (LGD-24), which used to carry
  its own copy.

`GET /api/events/:id/calendar.ics` — the same `VEVENT` on its own, with
`Content-Disposition: attachment; filename="<show-slug>.ics"`, 404 for an unknown id.

Public origin for the links is `primaryOrigin(env)` (first `ALLOWED_ORIGINS` entry), the
same rule the confirmation email uses.

## 4. The links (site)

`src/utils/calendar-links.ts`, unit-tested:

| Helper | Produces |
|---|---|
| `feedUrl(apiBase)` | `https://djkmdlegends.com/api/calendar.ics` |
| `webcalUrl(feed)` | `webcal://djkmdlegends.com/api/calendar.ics` — Apple Calendar and Outlook open their subscribe sheet on this scheme |
| `googleSubscribeUrl(feed)` | `https://calendar.google.com/calendar/r?cid=<webcal URL>` — Google's "add by URL", the same pattern Luma, Eventbrite and university feeds use |
| `googleEventUrl(event, origin)` | `https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=YYYYMMDDTHHMMSS/…&ctz=America/New_York&details=…&location=…` — floating local times pinned to Eastern via `ctz`; three hours when the feed has no end time |
| `eventIcsUrl(apiBase, id)` | the one-show download |

`AddToCalendarMenu` (`src/components/calendar/`) is the shared chooser: a button with
`aria-haspopup="menu"`, a `role="menu"` list of links or actions, closes on outside tap or
Escape, shows "Link copied" for the clipboard action.

## 5. Tests

- Worker `test/calendar-feed.test.ts`: content and headers, UTC conversion, escaping of
  commas, folding ≤ 75 octets with CRLF, cancelled → `STATUS:CANCELLED` + `SEQUENCE:1`,
  past shows dropped (record aged in KV, since the admin API refuses past dates), 405, the
  one-show file's disposition and single `VEVENT`, 404.
- Site `src/utils/calendar-links.test.ts`: every helper, including midnight-crossing
  default end times and shows with no id/time/location.
- E2E `calendar.spec.ts` "subscribe and add-to-calendar menus…": the subscribe menu's three
  hrefs, the feed reachable with the fixture show, the card's Google link parameters and the
  one-show download's filename.

## 6. Checking it by hand

```bash
curl -s https://djkmdlegends.com/api/calendar.ics | head -20          # BEGIN:VCALENDAR … X-WR-CALNAME
curl -s https://djkmdlegends.com/api/calendar.ics | tr -d '\r' | awk 'length > 75'   # must print nothing (strip the CR first)
```

On an iPhone: open https://djkmdlegends.com/calendar → Subscribe → *Apple Calendar /
Outlook* → the Calendar app asks to subscribe to "DJKMD Legends Shows". In Google
Calendar on the web: Subscribe → *Google Calendar* → "Add calendar" with the URL filled in.

## 7. Not done

- **Per-venue or per-act feeds.** One feed is right for the volume of shows we run.
- **Reminders (`VALARM`).** Subscribed calendars apply the user's own defaults; pushing an
  alarm into other people's calendars is impolite.
- **Signalling sold-out as a status.** iCalendar has no such status; it is in the
  description and the show page.
