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
   - **Seating chart** *(optional, v0.5)* — pick one of your saved layouts to sell **reserved seats** at this show. Capacity then locks to the layout's seat count. Leave it on *General admission* for a normal show. Build layouts first with [SOP 7](#sop-7--build-a-seating-chart-). You can change or remove the chart from **Manage Shows → Edit** right up until the first ticket sells.
3. Click **Create Show**. This takes a few seconds (it's creating the Square links + saving the image). Wait for the green confirmation.

**Verify:** within a minute, the show appears under **Upcoming Shows** with its image; **Buy Tickets** opens a modal with one Buy button per ticket type, each going to its Square checkout. On a reserved-seating show, Buy first shows "We've saved seats for your party…" with a little map — **Looks good, continue** takes the buyer to Square; **Change table** offers other tables that fit the party. Seats stay held for 12 minutes while they pay.

**What the buyer receives:** Square's receipt for the payment, plus a **DJKMD Legends confirmation email** (from `tickets@mg.djkmdlegends.com`, replies go to the booking mailbox) with the show, date/time, **venue name + address + a Google Maps link**, what they bought, their seats (or "first come, first served" / "staff will seat you"), the name to give at the door, and a calendar file. So the **Venue address** you type is exactly what buyers navigate to — get it right. (Square's own receipt always shows our one Square location, Princeton Station; that's expected and not fixable without paying Square $149/month per extra "location".)

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

### Reserved-seating shows at the door (v0.5)

On a show with a seating chart, the roster header gains a **List | Chart** toggle (the phone remembers your choice).

- **Chart** shows the room: open seats outlined, **sold gold**, **arrived green**, held (mid-checkout) hatched, with "12 / 40 seats arrived". **Tap a sold seat** → that party's card → **Check in**. The seat turns green at once, and every other phone on the same show catches up within about 8 seconds on its own.
- **List** works exactly as before; each party row also shows its seats ("T2-1, T2-2"), and the party card shows "Seats: …".
- A party marked **needs seats** paid after their held seats lapsed (rare: they sat on the Square page past 12 minutes while someone else bought the seats). Give them seats: **Chart → Assign seats** (or open the party → **Assign seats**), tap seats on the room — or **Best available** — then **Save**. Taken seats are dimmed and cannot be tapped. To move any party, open it and tap **Change seats**.
- If a seat gets bought between your tap and Save, the app tells you which one ("Seat T4-2 was just taken — pick again") and the party keeps the seats it had.
- **Print list** includes a **Seats** column on these shows.

**"I never got my email" (any show, seated or not):** open the party's card → **Resend confirmation email**. The card shows when it was last emailed ("Emailed Sep 20, 7:02 PM" / "Not emailed yet"). A party with no email on file (rare: they paid without one) gets no button — check them in by name.

The same live room is also under **Manage Shows → Seating chart** for the box office.

---

## SOP 5b — Check ticket sales 🎤

Open **Legends Admin → Sales** (`https://admin.djkmdlegends.com/sales`). No Square login needed.

- **Top tiles:** gross ticket sales across every show, tickets sold, and orders.
- **Gross by show:** one bar per show (colour = ticket type; tap a segment for its numbers).
- **Upcoming / All shows:** the page opens on upcoming shows; switch to **All shows** to include anything that ended in the past year (older shows stay in the system but drop out of the view).
- **By show:** tap a show to list its buyers (name, tickets, type, amount paid, date).
- **Export CSV:** downloads one spreadsheet row per order for the current view — switch to **All shows** first to export the year (for the accountant, Square's own Dashboard → Reports export remains the authority: it has refunds and fees; ours is gross at checkout).

Gross is what buyers paid at checkout. Refunds, Square fees and payouts are only in Square. Orders placed before amounts were captured are valued at the show's current ticket price and marked *est.*

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

## SOP 7 — Build a seating chart 🎤

Reserved seating starts with a **layout** of the room, drawn once in Legends Admin and reused for every show at that venue. Layouts are copied onto a show when you attach them, so editing a layout later never changes a show that is already selling.

1. Open **Legends Admin → Seating Charts** → **New chart**. Name it after the room ("Elks Lodge — dinner").
2. Add pieces from the palette: **round table**, **rectangular table**, **row of seats**, **stage**. Drag to place; tap a piece to select it, then use the inspector to set its **label** (T1, T2… or A, B for rows), the **number of seats**, size and rotation. Tables and rows are numbered clockwise / left-to-right from seat 1.
3. Put the **stage** where it really is — buyers are seated **nearest the stage first**, so the geometry matters.
4. Tap **Save**. The list shows a thumbnail and the seat count; **Duplicate** copies a layout for a variant (e.g. cabaret vs. banquet).
5. Attach the layout when creating the show ([SOP 2](#sop-2--add-a-new-show--event-)) or later from **Manage Shows → Edit → Seating chart** (only until the first ticket sells). **Manage Shows → Seating chart** opens the live room for that show; **Re-sync from layout** there re-copies a corrected layout while nothing has sold.

**How buyers are seated:** the site picks seats for them — the whole party together at the table nearest the stage that has room (a table is skipped only if it would leave one lone empty seat and another table avoids that); if no table fits, the party is split across neighbouring tables, and the buyer is told. Buyers never tap individual seats; they can only switch tables. Tickets sold before a chart is attached are not affected because attaching is refused once anything has sold.

**Gotchas:**
- Two layouts can't share a name.
- Deleting a layout that a show uses is refused — detach it from the show first (or delete the show).
- Capacity on a seated show is always the seat count; edit the layout, not the capacity.

---

## Quick reference — which task, what's needed

| Task | Type | Edit | Deploy? |
| --- | --- | --- | --- |
| Add/edit/reorder an artist | 🧑‍💻 | `src/content/performers.ts` + image in `public/assets/images/` | **Yes** |
| Add a show | 🎤 | Legends Admin (`admin.djkmdlegends.com`) → Create a Show (auto-creates Square links) | No |
| Change ticket price/checkout | 🎤 | Legends Admin → Manage Shows → edit (or delete + recreate) | No |
| Check guests in at the door | 🎤 | Legends Admin → Door Check-in (List, or Chart on seated shows — tap a seat) | No |
| Build / edit a venue layout | 🎤 | Legends Admin → Seating Charts (SOP 7) | No |
| Sell reserved seats at a show | 🎤 | Legends Admin → Create a Show → Seating chart (SOP 2) | No |
| Give a party seats / move them | 🎤 | Door Check-in → party → Assign / Change seats (SOP 5) | No |
| Grandfathered (legacy) shows | 🎤 | Leave in Google Calendar until ~Sept 2026 | No |
| Set the YouTube video | 🧑‍💻 | `VITE_YOUTUBE_VIDEO_ID` GitHub secret | **Yes** |
| Edit site copy | 🧑‍💻 | `src/content/site.ts` (and `social.ts`) | **Yes** |
| View / export the mailing list | 🎤 | Legends Admin → Mailing List (CSV export); or KV `MAILING_LIST` via `wrangler` | No |
| Load a guestlist | 🎤 | `tools/ingest-guestlist.mjs` → KV `GUESTLIST` | No |
| Ship code changes (site / admin PWA / worker) | 🧑‍💻 | — | **Yes** (SOP 6) |
