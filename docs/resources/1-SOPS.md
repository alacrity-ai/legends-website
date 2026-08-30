# 1 — Standard Operating Procedures

Step-by-step procedures for the routine tasks of running the Legends site. Read **`0-HIGH_LEVEL.md`** first for the lay of the land.

Each SOP is tagged by who does it and whether code changes:

- 🧑‍💻 **Dev task** — requires editing the repo + a redeploy.
- 🎤 **Operator task** — done in Google Calendar / Square / a dashboard; no code, no deploy.

> **The golden rule of deploys:** anything in the **repo** (artists, the YouTube video, copy) only goes live after a deploy. Anything in **Google Calendar, Square, or KV** (shows, tickets, mailing list, guestlists) is live within ~1 minute with **no deploy**. Know which kind of change you're making before you start.

**How a deploy happens:** GitHub → Actions → **"Deploy to Cloudflare Pages"** → **Run workflow** (it's `workflow_dispatch`, i.e. manual). This rebuilds the public site **and** the admin PWA and redeploys the Worker. See SOP 6.

---

## SOP 1 — Add a new artist to the performers carousel 🧑‍💻

The carousel (`#acts` on the homepage) is driven entirely by data in `src/content/performers.ts`. Adding an act = adding an image + one array entry + a deploy.

1. **Prepare the photo.**
   - Format: **`.webp`**, matching the existing performer images.
   - Save it to `public/assets/images/` named `performer-<slug>.webp` (e.g. `performer-madonna.webp`).
   - Keep dimensions/aspect ratio consistent with the existing `performer-*.webp` files so cards line up. (`tools/cropper.html` can help crop.)

2. **Add the entry.** Open `src/content/performers.ts` and append an object to the `performers` array. Shape (`src/types/performer.ts`):

   ```ts
   {
     id: 'madonna-tribute',                 // unique kebab-case; used as React key
     name: 'Like a Legend',                 // act/show name shown on the card
     imageSrc: '/assets/images/performer-madonna.webp',  // path under public/
     imageAlt: 'Madonna tribute performer on stage',     // accessibility text
     shortDescription:
       'A high-energy Madonna tribute packed with era-spanning hits and bold staging.',
     tags: ['tribute', 'live vocals', 'event-ready'],     // optional chips
   },
   ```

   - `imageSrc` is rooted at `public/`, so the path always starts with `/assets/...`.
   - Order in the array = order in the carousel.

3. **Check it locally** (optional but recommended): `make dev-site`, open http://localhost:5173, scroll to **Our Performers**.

4. **Deploy** (SOP 6). The new act is live after the build completes.

**Remove / reorder an act:** delete or move its object in the same array, then deploy. (You may leave the old image file; it just won't be referenced.)

---

## SOP 2 — Add a new show / event 🎤

Shows are created through the **Legends Admin** app at `https://admin.djkmdlegends.com` (install it to your phone's home screen — Share → *Add to Home Screen* on iPhone, the install prompt on Android). The **Create a Show** form creates the Square checkout link(s) for you automatically — no Square dashboard steps, no Google Calendar, no copy-pasting links. **No deploy needed** — the show appears under Upcoming Shows within ~1 minute.

> **Legacy note:** the 2 original shows still live in **Google Calendar** with pasted Square links, and stay that way until ~September 2026 (see [SOP 2-Legacy](#sop-2legacy--grandfathered-google-calendar-shows-)). All **new** shows go through the form below — don't add new shows to the calendar.

### Steps

1. Open **`https://admin.djkmdlegends.com`** and sign in with the admin passcode → choose **Create a Show**.
2. Fill in the form (all fields required):
   - **Show name** — appears on the site.
   - **Description** — the blurb buyers see (multi-line; plain text).
   - **Venue name** + **Venue address** — address becomes a Google Maps link on the card.
   - **Start time** / **End time** — must be in the future; end after start (New England local time).
   - **Ticket types & prices** — one row per ticket type (e.g. "Show Only" $45, "Dinner + Show" $75). Click **+ Add ticket type** for more; most shows have 1–2. Each becomes its own Square checkout + its own Buy button on the site.
   - **Show image** — upload a JPEG/PNG/WebP (≤ 5 MB) from your computer; a preview appears.
3. Click **Create Show**. This takes a few seconds (it's creating the Square links + saving the image). Wait for the green confirmation.

**Verify:** within a minute, the show appears under **Upcoming Shows** with its image; **Buy Tickets** opens a modal with one Buy button per ticket type, each going to its Square checkout.

**Remove a show:** Legends Admin → **Manage Shows** → delete it. This also deactivates its Square links and removes the image.

**Gotchas:**
- "Square: … failed" on submit → the price or Square config was rejected; nothing is saved, fix and resubmit.
- Start time in the past → rejected. Use a future date/time.
- Image too large → keep it under 5 MB.

---

## SOP 2-Legacy — Grandfathered Google Calendar shows 🎤

The 2 original shows predate the form and have **live bookings on their existing Square links**. Leave them alone:

- **Do not** delete them from the DJKMD Legends Google Calendar, and **do not** re-create them in the new form (that would double-list them).
- They keep working because the site's feed merges Google Calendar events while `LEGACY_CALENDAR_ENABLED = "true"`.
- Around **September 2026**, once those shows have passed, a dev flips `LEGACY_CALENDAR_ENABLED` to `"false"` and the calendar path is retired (see `docs/v0.2/event_form/1-IMPLEMENTATION.md` Phase 8). No action needed from scheduling staff.

The old calendar-based instructions are preserved in `docs/EVENT_CREATION_GUIDE.md` for reference only.

---

## SOP 3 — Set or change the homepage YouTube video 🧑‍💻

The **Media** ("See Us Live") section is controlled by a build-time env var, **not** a content file. The section is **hidden entirely** when the value is empty.

1. Get the YouTube **video ID** — the part after `v=` in `https://www.youtube.com/watch?v=dQw4w9WgXcQ` → `dQw4w9WgXcQ` (the ID only, not the full URL).
2. Set it as the `VITE_YOUTUBE_VIDEO_ID` **GitHub Actions secret** (Repo → Settings → Secrets and variables → Actions). The deploy workflow injects it at build time.
   - For local testing, put `VITE_YOUTUBE_VIDEO_ID=dQw4w9WgXcQ` in `.env.local`.
3. **Deploy** (SOP 6). Because this is baked in at build time, the change only appears after a rebuild.

To **hide** the section, clear the secret and redeploy.

---

## SOP 4 — View / export the mailing list 🎤 (light CLI)

Signups from the homepage modal are stored in the **Cloudflare KV `MAILING_LIST`** namespace — one key per email (lowercased), value `{ "name": ..., "signedUpAt": ... }`. There is no admin UI; read it via the dashboard or `wrangler`.

**Option A — Cloudflare dashboard:** Workers & Pages → **KV** → open the `MAILING_LIST` namespace → browse keys (each key is an email).

**Option B — `wrangler` CLI** (run inside `worker/`, requires Cloudflare auth):

```bash
cd worker
# List every subscriber email (production)
npx wrangler kv key list --binding MAILING_LIST --remote

# Read one subscriber's record
npx wrangler kv key get --binding MAILING_LIST --remote "someone@example.com"
```

Pipe the list through `jq` to extract emails for an export. Add `--preview=false` if wrangler asks which namespace to use; drop `--remote` to read your **local** dev KV instead of production.

> Heads-up: there's currently **no unsubscribe** flow — removal is a manual `npx wrangler kv key delete --binding MAILING_LIST --remote "<email>"`.

---

## SOP 5 — Load a guestlist for door check-in 🎤 (light CLI)

The **Door Check-in** tool in Legends Admin (`https://admin.djkmdlegends.com/checkin`) builds rosters automatically from Square purchases (v0.3). The steps below are the **legacy CSV path** for the 2 grandfathered calendar shows: it reads the **KV `GUESTLIST`** namespace, keyed `roster:YYYY-MM-DD`. You populate it before the show from a Square orders export using `tools/ingest-guestlist.mjs`.

1. **Export orders from Square** for the show as CSV. The script expects these columns: `Recipient Name`, `Recipient Email`, `Recipient Phone`, `Item Quantity`, `Item Variation`, `Order Date`, `Fulfillment Notes`. (Variations are normalized to `Show and Meal` / `Show Only`.)
2. **Dry-run** to sanity-check parsing (prints parties, writes nothing):

   ```bash
   node tools/ingest-guestlist.mjs --csv orders.csv --show 2026-06-14 --dry-run
   ```

   `--show` must be `YYYY-MM-DD` and becomes the roster key / the show the staff app lists.
3. **Upload to production KV:**

   ```bash
   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
     node tools/ingest-guestlist.mjs --csv orders.csv --show 2026-06-14 --remote
   ```

   Without `--remote` it writes to your **local** dev KV (for testing against `make dev-worker`). The script dedupes buyers by email, aggregates ticket quantities, and sorts by last name.
4. **At the door:** staff open **Legends Admin** (`https://admin.djkmdlegends.com` → **Door Check-in**), sign in with the shared **`ADMIN_PASSCODE`**, pick the show date, search names, and check parties in/out. Check-ins are stored as separate `checkin:<show>:<partyId>` keys, so re-uploading a roster does **not** wipe who's already checked in.

**Re-uploading:** running the script again for the same `--show` overwrites the roster (`roster:<date>`) but leaves check-ins intact.

---

## SOP 6 — Deploy the site 🧑‍💻

All three artifacts (public site → Pages `legends-website`, admin PWA → Pages `legends-admin`, Worker → Cloudflare) ship from one **manually triggered** GitHub Actions workflow.

1. Merge/commit your change to `main`.
2. GitHub → **Actions** tab → **"Deploy to Cloudflare Pages"** → **Run workflow** (on `main`).
3. The workflow: `npm ci` → `npm run build` (injecting `VITE_*` secrets) → deploy `dist/` to Pages → `cd admin && npm ci && npm run build` → deploy `admin/dist/` to Pages (`legends-admin`) → `npm ci` + deploy in `worker/`.

**Partial deploys** (assuming Cloudflare creds are in your env — see `claude_ops/docs/sops/cloudflare-deploys.md`):
- Worker only (you only touched `worker/`): `make deploy-worker`.
- Admin PWA only (you only touched `admin/`): `make deploy-admin` (builds, then `wrangler pages deploy admin/dist --project-name legends-admin`).

**Before deploying**, run `make lint`, `make build` and `make build-admin` locally to catch type/build errors early.

---

## Quick reference — which task, what's needed

| Task | Type | Edit | Deploy? |
| --- | --- | --- | --- |
| Add/edit/reorder an artist | 🧑‍💻 | `src/content/performers.ts` + image in `public/assets/images/` | **Yes** |
| Add a show | 🎤 | Legends Admin (`admin.djkmdlegends.com`) → Create a Show (auto-creates Square links) | No |
| Change ticket price/checkout | 🎤 | Legends Admin → Manage Shows → edit (or delete + recreate) | No |
| Check guests in at the door | 🎤 | Legends Admin → Door Check-in | No |
| Grandfathered (legacy) shows | 🎤 | Leave in Google Calendar until ~Sept 2026 | No |
| Set the YouTube video | 🧑‍💻 | `VITE_YOUTUBE_VIDEO_ID` GitHub secret | **Yes** |
| Edit site copy | 🧑‍💻 | `src/content/site.ts` (and `social.ts`) | **Yes** |
| View / export the mailing list | 🎤 | Legends Admin → Mailing List (CSV export); or KV `MAILING_LIST` via `wrangler` | No |
| Load a guestlist | 🎤 | `tools/ingest-guestlist.mjs` → KV `GUESTLIST` | No |
| Ship code changes (site / admin PWA / worker) | 🧑‍💻 | — | **Yes** (SOP 6) |
