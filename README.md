# DJKMD Legends — Website

Marketing website for **DJKMD Legends**, a live celebrity impersonator and tribute act business — plus the staff **Admin PWA** and the Cloudflare Worker API behind both.

| Deployable | Source | Hosted at |
| --- | --- | --- |
| Public site | `src/` | `https://djkmdlegends.com` (Cloudflare Pages `legends-website`) |
| Admin PWA (staff console) | `admin/` | `https://admin.djkmdlegends.com` (Cloudflare Pages `legends-admin`, installable, `noindex`) |
| Booking/API worker | `worker/` | `djkmdlegends.com/api/*` **and** `admin.djkmdlegends.com/api/*` |

## Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Framework    | React 19 + TypeScript               |
| Build        | Vite 8                              |
| Styling      | CSS Modules + design tokens          |
| Linting      | ESLint 9 (flat config)              |
| Runtime      | Node 24                             |

## Getting started

### Option A — Docker (recommended)

Runs the public site and the booking worker together (the admin PWA is started separately — see below).

1. **Set up environment files:**

   ```bash
   # Frontend env (optional — has placeholder fallbacks for everything except booking)
   cp .env.example .env.local

   # Worker secrets (required for booking form to work)
   cp worker/.dev.vars.example worker/.dev.vars
   ```

   Edit `worker/.dev.vars` and fill in your real Mailgun API key and domain.

2. **Start everything:**

   ```bash
   docker compose up
   ```

   | Service | URL |
   |---|---|
   | Site | http://localhost:5173 |
   | Booking worker | http://localhost:8787 |

   Source files are volume-mounted — changes hot-reload automatically.

### Option B — Without Docker

```bash
# Install dependencies (site + worker + admin)
make install

# Start the frontend dev server (:5173)
npm run dev

# In a separate terminal, start the booking worker (:8787)
cd worker && npm run dev

# Optional, third terminal: the admin PWA (:5174, proxies /api → :8787)
make dev-admin
```

### Admin PWA (`admin/`)

The staff console (Create a Show, Manage Shows, Door Check-in, Mailing List) is its own Vite + React app in `admin/`, deployed as a separate Pages project and installable to a phone home screen. It has no build-time secrets: it calls `/api` on its own origin (the worker is routed on the admin host), so it needs no `.env` at all. Routes: `/`, `/events/new`, `/events`, `/checkin`, `/mailing-list`. The old `djkmdlegends.com/admin` and `/guestlist` URLs 301 to it.

```bash
make dev-admin      # dev server on :5174
make build-admin    # → admin/dist/
make deploy-admin   # wrangler pages deploy → legends-admin (needs Cloudflare creds in env)
```

## Environment variables

### Frontend (`.env.local`)

Copy the example and fill in values when ready:

```bash
cp .env.example .env.local
```

| Variable                            | Purpose                              |
| ----------------------------------- | ------------------------------------ |
| `VITE_BOOKING_API_URL`              | Worker URL (`http://localhost:8787` for local dev) |
| `VITE_YOUTUBE_VIDEO_ID`             | YouTube video ID for Media section   |
| `VITE_GOOGLE_CALENDAR_PUBLIC_URL`   | Google Calendar public link (fallback) |

> **Note:** The site runs locally without any `.env` file — all values have placeholder fallbacks. The booking form and calendar require the worker to be running.

### Worker secrets (`worker/.dev.vars`)

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

| Variable          | Purpose                              |
| ----------------- | ------------------------------------ |
| `MAILGUN_API_KEY` | Mailgun API key                      |
| `MAILGUN_DOMAIN`  | Mailgun sending domain (`mg.djkmdlegends.com`) |
| `GOOGLE_API_KEY`  | Google Calendar API key (legacy events) |
| `ADMIN_PASSCODE`  | Shared passcode gating the admin PWA (`admin.djkmdlegends.com`: check-in, shows, mailing list) |
| `SQUARE_ACCESS_TOKEN` | Square API token (use **sandbox** locally) |
| `SQUARE_LOCATION_ID`  | Square location for payment links    |
| `SQUARE_ENVIRONMENT`  | `sandbox` (local) / `production`     |

These are read automatically by `wrangler dev`. In production they are stored as Cloudflare Worker secrets (`wrangler secret put`).

**Worker bindings** (`worker/wrangler.toml`): KV namespaces `MAILING_LIST`, `GUESTLIST`, `EVENTS` (custom events), and R2 bucket `EVENT_IMAGES` (show images). See `docs/v0.2/event_form/` for the event-form feature. The worker has two routes (`djkmdlegends.com/api/*`, `admin.djkmdlegends.com/api/*`); `ALLOWED_ORIGINS` lists the public, admin, and local dev origins.

## Build

```bash
npm run build          # public site → dist/
make build-admin       # admin PWA  → admin/dist/
```

## Deploy

One manual GitHub Actions workflow (**Deploy to Cloudflare Pages**, `workflow_dispatch`) builds and ships all three artifacts in order: public site → admin PWA → worker. Locally: `make deploy-admin` / `make deploy-worker`. See `docs/resources/1-SOPS.md` → SOP 6.

## Project structure

```
src/
├── app/            # App shell (App.tsx, App.css)
├── components/
│   ├── layout/     # Header, Footer, Section, Container
│   ├── marketing/  # Hero, About, Performers, Media, Calendar, BookingForm, PressKit
│   └── shared/     # Button, Card, Heading
├── content/        # All site copy and configuration
├── services/       # API clients (booking, events, mailing-list signup)
├── styles/         # Global styles and design tokens
└── types/          # TypeScript interfaces

admin/              # Staff console PWA (separate Vite app, separate Pages project)
├── index.html      # PWA chrome: manifest link, theme-color, apple-touch-icon, noindex
├── public/         # manifest.webmanifest, sw.js (no-cache), icons/, _redirects, _headers, robots.txt
└── src/
    ├── app/        # App shell: passcode gate + menu + client-side routes
    ├── components/ # admin/ (EventForm, ManageShows, MailingList) + guestlist/ (door check-in)
    ├── services/   # Bearer-passcode API clients (api-base.ts = same-origin /api)
    ├── styles/     # tokens.css + globals.css (copied from the site's design system)
    ├── types/, utils/
    └── main.tsx    # registers /sw.js

worker/
├── src/
│   ├── index.ts        # Worker entry point
│   ├── services/       # Mailgun email client
│   ├── templates/      # Email template builders
│   ├── types.ts        # Shared types
│   └── validation.ts   # Payload validation
└── wrangler.toml       # Cloudflare Worker config
```
