# 0 — High-Level Overview

**Audience:** a developer being onboarded to the DJKMD Presents Legends website.
**Goal:** understand the *surfaces* of the app — the distinct pieces a dev will touch — and how they fit together, before diving into any one of them.

> **What is this?** Legends is the marketing + operations website for **DJ KMD Presents: Legends**, a group of celebrity-impersonator / tribute performers who gig around New England. The site markets the acts, lists upcoming shows, sells tickets, collects booking inquiries, runs a mailing list, and provides a door-check-in tool for shows.

---

## The stack at a glance

| Layer | Technology | Where it lives |
| --- | --- | --- |
| Frontend | React 19 + TypeScript, Vite 8, CSS Modules | `src/` → built to `dist/`, deployed to **Cloudflare Pages** (`legends-website`) |
| Backend API | A single **Cloudflare Worker** (`legends-booking-worker`) | `worker/` → served at `djkmdlegends.com/api/*` |
| Data store | **Cloudflare KV** — two namespaces: `MAILING_LIST`, `GUESTLIST` | bound in `worker/wrangler.toml` |
| Email | **Mailgun** (sending domain `mg.djkmdlegends.com`) | `worker/src/services/mailgun.ts` |
| Events | **Custom admin form → KV `EVENTS` + Square API** (v0.2). Legacy: Google Calendar (grandfathered until ~Sept 2026) | `worker/src/services/square.ts`, `google-calendar.ts` |
| Show images | **Cloudflare R2** bucket `EVENT_IMAGES` | `worker/wrangler.toml` |
| Payments | **Square** checkout links (no API — links are pasted into calendar events) | parsed in `src/utils/parse-description.ts` |
| Runtime / Deploy | Node 24, Docker for local, GitHub Actions (`workflow_dispatch`) for prod | `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy.yml` |

There are **two deployable artifacts**: the static frontend (Pages) and the Worker. They are deployed together by the one GitHub Actions workflow, which is **manually triggered** (`workflow_dispatch`).

---

## Surface 1 — The marketing site (public, `/`)

A single-page React app (`src/app/App.tsx`). Almost everything visible is one of these stacked sections, rendered in order. All copy lives in `src/content/` (`site.ts`, `performers.ts`, `social.ts`) — **content is data, not JSX**, so editing copy rarely means editing components.

| Section | Component | Notes / data source |
| --- | --- | --- |
| Header / nav | `components/layout/Header` | nav items from `site.ts` |
| Hero | `marketing/Hero` | headline/subcopy in `site.ts`; CTA opens the mailing-list modal |
| About | `marketing/About` | copy in `site.ts` |
| Performers | `marketing/Performers` | **the artist carousel** — driven by `content/performers.ts` |
| Media | `marketing/Media` | YouTube embed; hidden unless `VITE_YOUTUBE_VIDEO_ID` is set |
| Calendar | `marketing/Calendar` | **Upcoming Shows** — fetches `GET /api/events`, each card has a "Buy Tickets" button |
| Ticket modal | `marketing/TicketModal` | opened from a show card; shows the event description + a **Square "Buy Now"** link parsed out of the calendar event |
| Booking form | `marketing/BookingForm` | posts to `POST /api/booking` |
| Press Kit | `marketing/PressKit` | static download of `public/assets/press-kit/press-kit.zip` |
| Mailing list | `marketing/MailingList` (modal) | posts to `POST /api/mailing-list` |
| Footer | `components/layout/Footer` | social links from `content/social.ts` |

Shared primitives (`Button`, `Card`, `Heading`) and layout wrappers (`Section`, `Container`) live under `components/shared` and `components/layout`. Design tokens are in `src/styles/tokens.css`.

## Surface 2 — The guestlist / door check-in app (`/guestlist`)

A second mini-app inside the same React bundle. `App.tsx` route-switches: any path of `/guestlist` renders `components/guestlist/Guestlist.tsx` instead of the marketing site. It is a **staff tool** used at the door:

- Passcode sign-in (`SignIn`) → the passcode is sent as a `Bearer` token to the Worker.
- Pick a show (`ShowPicker`), search attendees (`SearchBar`), and check parties in/out (`PartyList`, `PartyRow`, `CheckInModal`).
- Talks to `GET/POST/DELETE /api/guestlist/*`, all gated by `GUESTLIST_PASSCODE`.
- Rosters are loaded into KV ahead of time from a Square orders CSV via `tools/ingest-guestlist.mjs`.

## Surface 3 — The Worker API (`/api/*`)

One Worker (`worker/src/index.ts`) routes four groups of endpoints. CORS is restricted to `ALLOWED_ORIGINS`.

| Endpoint | Method | Purpose | Backing service |
| --- | --- | --- | --- |
| `/api/events` | GET | Upcoming shows for the Calendar section | KV `EVENTS` (v0.2) merged with legacy Google Calendar, cached 60s |
| `/api/admin/events` | POST/GET/DELETE | Create/list/delete shows (admin-gated); creates Square links + stores image | KV `EVENTS`, R2, Square API |
| `/api/booking` | POST | Booking inquiry → emails the team + confirmation to sender | Mailgun |
| `/api/mailing-list` | POST | Save a signup (email + optional name) | KV `MAILING_LIST` |
| `/api/guestlist/...` | GET/POST/DELETE | List shows, fetch a roster, check parties in/out | KV `GUESTLIST`, passcode-gated |

Supporting modules: `services/mailgun.ts`, `services/google-calendar.ts`, `templates/` (email HTML/text), `validation.ts` (payload parsing), `types.ts`.

## Surface 4 — External integrations (the parts that live outside the repo)

These are the "moving parts" a dev can't see by reading code alone — they're configured in third-party dashboards:

- **Square** — ticketing. As of v0.2, the admin Event Form creates Square **payment links programmatically** via the API (one per ticket type); see `worker/src/services/square.ts`. Legacy shows still use manually-pasted `square.link` URLs in calendar descriptions.
- **Google Calendar** — *legacy* source for the 2 grandfathered shows only, kept until ~Sept 2026 (`LEGACY_CALENDAR_ENABLED` flag). New shows live in KV `EVENTS`. Event description on legacy events doubles as ticket data (see `parse-description.ts`).
- **Square** — ticketing. Each show gets a manually-created checkout "Payment Link"; the URL is pasted into the calendar event. There is no Square API integration.
- **Mailgun** — transactional email for booking inquiries.
- **Cloudflare KV** — two namespaces persist the mailing list and guestlist rosters/check-ins.

## Surface 5 — Content, tooling & config

- **Content layer** (`src/content/`) — performers, site copy, social links. Most "content edits" happen here.
- **Tooling** (`tools/`) — `ingest-guestlist.mjs` (CSV → KV roster), `cropper.html`, `profit_calculator.html`, press-kit source.
- **Config / secrets** — frontend public vars in `.env.example` (`VITE_*`); Worker secrets in `worker/.dev.vars.example` (`MAILGUN_API_KEY`, `GOOGLE_API_KEY`, `GUESTLIST_PASSCODE`); Worker non-secret vars and KV bindings in `worker/wrangler.toml`.

---

## How a request flows (mental model)

1. **Visitor loads the site** → static React app from Cloudflare Pages.
2. **Calendar section** calls the Worker → Worker reads Google Calendar → returns shows; each event's Square link rides along in the description.
3. **Buy Tickets** → modal parses the Square link out of the description → sends the buyer to Square's hosted checkout.
4. **Booking form** → Worker → Mailgun emails the team + the inquirer.
5. **Mailing-list signup** → Worker → KV.
6. **At the door**, staff open `/guestlist` → sign in with the passcode → Worker reads the pre-loaded roster from KV and records check-ins.

---

## Where to look next

- **Day-to-day operator tasks** (add an artist, add a show, view the mailing list, set the YouTube video, load a guestlist) → **`1-SOPS.md`**.
- Deep design/implementation notes for each feature live in the top-level `docs/` folder (e.g. `CALENDAR_IMPLEMENTATION.md`, `GUESTLIST_DESIGN.md`, `MAILING_LIST_IMPLEMENTATION.md`).
- The non-technical, owner-facing version of the show-creation flow is `docs/EVENT_CREATION_GUIDE.md`.
