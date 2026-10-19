# Show Calendar page — design + implementation (LGD-40)

**Status:** shipped 2026-10-19. **Live:** https://djkmdlegends.com/calendar · subscribe/add-to-calendar: `CALENDAR_FEED.md` (LGD-41)
**Ticket:** LGD-40. **Asked for by:** Keith, after clients asked whether Legends has an online calendar.

---

## 1. Why

The homepage's *Upcoming Shows* section is a list. Clients and fans asked Keith for a
calendar: the same shows, by date, at an address he can text to someone. This page is that,
and it sells tickets from the calendar itself so nobody has to find their way back to the
homepage to buy.

## 2. What the visitor gets

| | |
|---|---|
| **Address** | `djkmdlegends.com/calendar` (also `/calendar?event=<id>`, which opens that show's tickets, the same contract as the homepage's `/?event=<id>` used by QR codes and shared links) |
| **Entry points** | Hero: a gold **Show Calendar** button (the old *Upcoming Shows* button steps back to the ghost style). *Upcoming Shows* heading: **View Full Calendar**. Header nav: **Calendar** item, marked current on the page |
| **Range** | Opens on the current month. *Back* is disabled at the current month; *forward* stops at the month of the farthest scheduled show. The range grows by itself as Keith adds shows. With no shows at all it is just this month |
| **Month grid (≥ 640px)** | Sunday-first, padded to whole weeks. Today's number sits in a gold disc. Each show is a gold **chip** on its day: title, then time · short venue name ("Billerica Elks", "Anthony's"). Sold-out chips are muted with a *Sold out* suffix; cancelled chips are struck through with a red *Cancelled* suffix but stay on the day so ticket holders still find the show. Up to three chips per day, then **+N more** jumps to the list |
| **Month grid (phones)** | Cells are squares with the day number and up to three **dots** (gold = on sale, grey = sold out, red = cancelled). A day with shows is one tap target: it scrolls to that day's card below and highlights it for a moment |
| **Show list** | Under the grid, *Shows in &lt;Month&gt;*: one card per show with a date badge (weekday, big day number, month), title, status badge, time, venue (Google Maps link), and **Buy Tickets**. On wide screens the poster thumbnail appears. The list is the accessible path through the page; the grid is a visual index of it |
| **Buying** | Chips, cards and the deep link all open the existing `TicketModal` with the show, so quantity, price, reserved seating (`SeatSheet`) and checkout behave exactly as on the homepage |
| **Empty month** | A dashed panel: *No shows in &lt;Month&gt; yet* + a **Book Us!** button to `/#book` |
| **Errors** | Feed failure shows the homepage's calm message with a link back to *Upcoming Shows* |
| **Keyboard / AT** | ←/→ page months (not while a modal is open or focus is in a field). Prev/next buttons announce the month they go to and why they are disabled. Day cells and chips carry full-sentence labels. The month title is `aria-live`. Reduced motion disables lifts and smooth scrolling |
| **Title / SEO** | Document title *Show Calendar · November 2026 \| DJKMD Legends* per month; `/calendar` is in `public/sitemap.xml` |

### Visual language

Same tokens as the rest of the site (`src/styles/tokens.css`): Cinzel for the month
title, weekday row, day numbers and date badges; Hanken Grotesk for chip and card copy;
gold accents on near-black surfaces. The grid lives in a `--color-surface` panel with the
strong gold border; the weekday row is tinted `--gold-06`; days with shows are tinted the
same so the eye finds them before reading. Chips use the gilded gradient of the primary
button at low opacity so they read as "tappable gold" without competing with the real
buttons on the cards.

## 3. How it is built

```
src/app/App.tsx                         path check: /calendar → <CalendarPage/>, else <MarketingSite/>
src/components/calendar/
  CalendarPage.tsx                      page: fetch, month state, deep link, keys, title, modals
  MonthNav.tsx                          ‹ Month Year ›  + "Back to this month"
  MonthGrid.tsx                         weekday row + day cells; chips (desktop) or dots (phones)
  ShowList.tsx                          "Shows in <Month>" cards, empty state
  useCompactLayout.ts                   matchMedia('(max-width: 639px)') via useSyncExternalStore
  CalendarPage.module.css               all styles; the 639px breakpoint must match the hook
src/components/shared/CalendarIcon/     inline SVG glyph used by the two buttons
src/utils/calendar.ts                   pure helpers (below) — the only logic worth unit-testing
src/utils/calendar.test.ts              vitest, run by `npm test` / `make test-site` / CI
src/components/layout/Header/Header.tsx `page` prop; anchors become `/#id` off the homepage
src/content/site.ts                     navItems gains Calendar; calendarPagePath
public/sitemap.xml                      /calendar
tests/e2e/specs/calendar.spec.ts        Playwright: phone + desktop flows
```

### Routing

Two pages do not justify a router dependency. `App` reads `window.location.pathname`;
`/calendar` renders `CalendarPage`, anything else the one-page site. Cloudflare Pages
already serves `index.html` for unknown paths (`public/_redirects`: `/* /index.html 200`),
so no hosting change was needed. Navigation between the pages is a plain link (full page
load, the bundle is small and cached). Header section anchors are written `/#about` when the
header is not on the homepage, except `#calendar`, which exists on both pages (the grid here,
*Upcoming Shows* there).

### Data

`GET /api/events` (`fetchUpcomingEvents`) is the only call, the same feed the homepage
uses: upcoming shows only, each with `date` (`YYYY-MM-DD`) and `time` (`HH:MM`) as the
worker emits them in Eastern time. The helpers work on those strings, never on `Date`
arithmetic across timezones, so a show always lands on the day the poster says.

- `monthRange(today, events)` → `{ first, last }` months (`YYYY-MM`, string-comparable).
- `monthGrid(ym, today)` → cells padded to whole Sunday-first weeks, with `inMonth`, `isToday`, `isPast`.
- `groupByDay(events)` / `eventsInMonth(events, ym)` → sorted by date, then time, then title.
- `venueShortName(location)` → text before the first comma, minus a leading "The".
- `formatTime12`, `dayParts`, `longDate`, `monthLabel`, `todayISO`, `addMonths`, `dayAnchorId`.

### Phone vs desktop

`useCompactLayout()` is true below 640px. The grid then renders each day with shows as a
single `<button>` (dots inside) that calls `jumpToDay(date)`: `scrollIntoView` on the first
card of that day (`id="day-YYYY-MM-DD"`) and a 2.4 s highlight. On desktop a day is a `div`
and each show is its own `<button>` chip calling `onOpen(event)`. Rendering the right
elements for each layout, rather than hiding text with CSS, keeps nested-button HTML and
8px tap targets out of the DOM.

### Tests

- **Unit** (`npm test`, `make test-site`, CI *Site unit tests*): month maths across year
  boundaries, grid padding (five vs six rows), sorting/grouping, labels, venue shortening,
  `todayISO` without timezone drift. `vitest.config.ts` scopes vitest to `src/**` because
  the repo also contains `shared/` (its own runner) and `reference_repos/`.
- **E2E** (`make test-e2e`, `tests/e2e/specs/calendar.spec.ts`): phone project: opens on
  this month, back disabled, forward to the show's month then disabled, no horizontal
  overflow; tapping the day scrolls to the card and *Buy Tickets* opens the modal with the
  right price; `/calendar?event=` opens the modal on the show's month; header anchors are
  absolute and *Calendar* is `aria-current`. Desktop block: the chip shows title, time and
  venue and opens the modal; arrow keys page months; the hero and *Upcoming Shows* link to
  `/calendar`. The fixture show is created mid-month (`createShow({ startTime })`) so other
  specs' June-1st leftovers never push it behind *+N more*.

## 4. Operating it

Nothing to operate: the page reads the live feed, so creating, cancelling or selling out a
show in the Admin PWA changes the calendar within the feed's cache window, like *Upcoming
Shows*. Deploys go through the GitHub **Deploy to Cloudflare Pages** workflow (the public
site must never be built on a laptop, see LGD-30 and `docs/resources/1-SOPS.md` SOP 6).

## 5. Not done, on purpose

- ~~Subscribe (.ics feed)~~ — done the same day as LGD-41: see `CALENDAR_FEED.md`
  (feed at `/api/calendar.ics`, **Subscribe** in the intro band, **Add to calendar** on
  each card).
- **Past shows.** The feed is upcoming-only, so earlier months are not offered. If a
  "what did we do last year" view is wanted, the feed needs a `?from=` and the back button a
  different floor.
- **Per-show pages / Event JSON-LD.** Search-engine rich results for individual shows would
  need per-show URLs with server-rendered metadata; this SPA route has one title and
  description. Worth it only if organic ticket search becomes a channel.
