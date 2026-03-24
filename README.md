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

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev
```

The site runs at **http://localhost:5173** by default.

## Environment variables

All third-party integrations are configured via environment variables.
Copy the example file and fill in real values when ready:

```bash
cp .env.example .env.local
```

| Variable                            | Purpose                              |
| ----------------------------------- | ------------------------------------ |
| `VITE_BOOKING_FORM_ENDPOINT`        | Formspree form action URL            |
| `VITE_YOUTUBE_VIDEO_ID`             | YouTube video ID for Media section   |
| `VITE_GOOGLE_CALENDAR_EMBED_URL`    | Google Calendar iframe embed URL     |
| `VITE_GOOGLE_CALENDAR_PUBLIC_URL`   | Google Calendar public link          |

> **Note:** The site runs locally without any `.env` file — all values have placeholder fallbacks.

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
├── styles/         # Global styles and design tokens
└── types/          # TypeScript interfaces
```
