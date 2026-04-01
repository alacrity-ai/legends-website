# DJKMD Legends — Website

Marketing website for **DJKMD Legends**, a live celebrity impersonator and tribute act business.

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

Runs both the frontend and the booking worker together.

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
# Install dependencies
npm install
cd worker && npm install && cd ..

# Start the frontend dev server
npm run dev

# In a separate terminal, start the booking worker
cd worker && npm run dev
```

## Environment variables

### Frontend (`.env.local`)

Copy the example and fill in values when ready:

```bash
cp .env.example .env.local
```

| Variable                            | Purpose                              |
| ----------------------------------- | ------------------------------------ |
| `VITE_BOOKING_API_URL`              | Booking worker URL (`http://localhost:8787` for local dev) |
| `VITE_YOUTUBE_VIDEO_ID`             | YouTube video ID for Media section   |
| `VITE_GOOGLE_CALENDAR_EMBED_URL`    | Google Calendar iframe embed URL     |
| `VITE_GOOGLE_CALENDAR_PUBLIC_URL`   | Google Calendar public link          |

> **Note:** The site runs locally without any `.env` file — all values have placeholder fallbacks. The booking form requires the worker to be running.

### Worker secrets (`worker/.dev.vars`)

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

| Variable          | Purpose                              |
| ----------------- | ------------------------------------ |
| `MAILGUN_API_KEY` | Mailgun API key                      |
| `MAILGUN_DOMAIN`  | Mailgun sending domain (`mg.djkmdlegends.com`) |

These are read automatically by `wrangler dev`. In production they are stored as Cloudflare Worker secrets.

## Build

```bash
npm run build
```

Production output is written to `dist/`.

## Project structure

```
src/
├── app/            # App shell (App.tsx, App.css)
├── components/
│   ├── layout/     # Header, Footer, Section, Container
│   ├── marketing/  # Hero, About, Performers, Media, Calendar, BookingForm, PressKit
│   └── shared/     # Button, Card, Heading
├── content/        # All site copy and configuration
├── services/       # API clients (booking submission)
├── styles/         # Global styles and design tokens
└── types/          # TypeScript interfaces

worker/
├── src/
│   ├── index.ts        # Worker entry point
│   ├── services/       # Mailgun email client
│   ├── templates/      # Email template builders
│   ├── types.ts        # Shared types
│   └── validation.ts   # Payload validation
└── wrangler.toml       # Cloudflare Worker config
```
