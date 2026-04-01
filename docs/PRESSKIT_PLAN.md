# Press Kit — Implementation Plan

Replace the placeholder `press-kit.zip` with a real press kit containing logos, performer photos, and a brand overview document.

---

## Contents of the Press Kit

```
DJKMD-Legends-Press-Kit/
├── README.txt                 # What's in the kit + contact info
├── Brand-Overview.pdf         # One-page brand overview (generated from markdown)
├── Logos/
│   ├── logo_full.png          # Full stacked logo
│   └── logo_wide.png          # Wide/horizontal logo
├── Promo/
│   └── hero.png               # Hero promotional image
└── Performers/
    ├── The-King-Experience.png       # Elvis
    ├── Believe-in-Cher.png           # Cher
    ├── The-Amy-Experience.png        # Amy Winehouse
    ├── Dolly-Pardon.png              # Dolly Parton
    ├── Sinatra-Under-the-Stars.png   # Frank Sinatra
    ├── Miley-Mania.png               # Miley Cyrus
    └── 24K-Bruno.png                 # Bruno Mars
```

Performer images are renamed to their act names for press usability (not `performer-elvis.png`).

---

## Step 1 — Draft the Brand Overview

### File to create

**`tools/press-kit/brand-overview.md`**

A one-page brand overview document covering:
- What DJKMD Legends is (one paragraph)
- What we offer (event types, venue types)
- Current roster of performers (names + one-line descriptions from `performers.ts`)
- Booking contact: `booking@djkmdlegends.com`
- Website: `djkmdlegends.com`
- Social links (Instagram, Facebook, YouTube, TikTok — from `social.ts`)

This markdown file is the source of truth. We'll convert it to PDF in the next step.

### Acceptance criteria
- Professional, concise copy suitable for venue owners and press.
- All 7 performers listed with act names and one-line descriptions.
- Contact info and social links included.

---

## Step 2 — Generate the PDF

### Action

Convert `tools/press-kit/brand-overview.md` to `tools/press-kit/Brand-Overview.pdf` using a markdown-to-PDF tool (e.g. `mdpdf`, `md-to-pdf`, or Pandoc if available).

If no PDF tool is practical, generate a clean plain-text version (`Brand-Overview.txt`) instead — a .txt is still usable in a press kit and avoids adding build dependencies.

### Acceptance criteria
- A readable, well-formatted document exists as PDF or TXT.
- No build dependency required for the main site — this is a one-time generation step in `tools/`.

---

## Step 3 — Draft the README.txt

### File to create

**`tools/press-kit/README.txt`**

Short plain-text file explaining what's in the zip:

```
DJKMD Legends — Press Kit

Contents:
- Brand-Overview.pdf — Company overview, performer roster, and contact info
- Logos/ — Official logos (full and wide formats)
- Promo/ — Promotional hero image
- Performers/ — Individual performer promotional photos

Contact: booking@djkmdlegends.com
Website: djkmdlegends.com
```

### Acceptance criteria
- Clear, scannable, no fluff.

---

## Step 4 — Build the Zip

### Action

Run a script (or manual commands) from the project root that:

1. Creates a temp directory `DJKMD-Legends-Press-Kit/` with the folder structure above.
2. Copies the images from `public/assets/images/`, renaming performers to act names.
3. Copies the brand overview and README.
4. Zips into `public/assets/press-kit/press-kit.zip`, replacing the placeholder.
5. Cleans up the temp directory.

Image file mapping:
| Source | Destination |
|---|---|
| `hero.png` | `Promo/hero.png` |
| `logo_full.png` (from `full_logo.png`) | `Logos/logo_full.png` |
| `logo_wide.png` | `Logos/logo_wide.png` |
| `performer-elvis.png` | `Performers/The-King-Experience.png` |
| `performer-cher.png` | `Performers/Believe-in-Cher.png` |
| `performer-amy.png` | `Performers/The-Amy-Experience.png` |
| `performer-dolly.png` | `Performers/Dolly-Pardon.png` |
| `performer-sinatra.png` | `Performers/Sinatra-Under-the-Stars.png` |
| `performer-miley.png` | `Performers/Miley-Mania.png` |
| `performer-bruno.png` | `Performers/24K-Bruno.png` |

### Acceptance criteria
- `public/assets/press-kit/press-kit.zip` exists and is significantly larger than the 228-byte placeholder.
- Unzipping produces the correct folder structure with all files present.
- All images are valid (not corrupted during copy).

---

## Step 5 — Local Test

### Actions

1. `docker compose up --build` (or just refresh if already running — static assets are volume-mounted).
2. Open `http://localhost:5173`, scroll to Press Kit.
3. Click "Download Press Kit (.zip)".
4. Unzip and verify contents: logos, performers, promo image, brand overview, README.

### Acceptance criteria
- Download works from the site.
- Zip contains all expected files in the correct structure.
- Brand overview is readable and accurate.
- Performer images match their act names.
