# Agent runbook — Adding & editing shows via the API

**Audience: you, a coding agent**, asked by the user to add / change / remove a show.
This is the operational playbook. For the full contract see `docs/v0.2/event_form/2-API.md`;
for the design see `docs/v0.2/event_form/0-DESIGN.md`.

## What you're doing

Shows live in Cloudflare KV. As of **v0.3 ("Option E")**, creating a show makes
**no Square calls** — it stores ticket *price configs* and an optional capacity.
Checkout links are minted **on demand** when a buyer picks a quantity on the site
(`POST /api/events/:id/checkout`). To add a show you **POST JSON to the live API** —
you do **not** deploy anything, and you do **not** edit the repo. The show appears on
`djkmdlegends.com` (Upcoming Shows) within ~60s.

- Endpoint: `POST https://djkmdlegends.com/api/admin/events` (`Content-Type: application/json`)
- Update: `PATCH /api/admin/events/:id` · Remove: `DELETE /api/admin/events/:id`
- All require `Authorization: Bearer <ADMIN_PASSCODE>`.
- **Share link / QR for a show is the site URL** `https://djkmdlegends.com/?event=<id>` —
  it opens the show with the quantity stepper. Do **not** share a raw `square.link` URL.

## Step 0 — Get the passcode (you cannot read it)

The admin passcode is a Cloudflare Worker secret. It is **not** in `DO_NOT_COMMIT.md`
and secrets are write-only, so **you cannot retrieve it**. Options, in order:

1. **Ask the user for it.** They'll paste a value (often a temporary one they rotate after).
2. If they tell you to, you *can* set a temporary one (Cloudflare creds are in the
   gitignored `DO_NOT_COMMIT.md`):
   ```bash
   cd worker
   export CLOUDFLARE_API_TOKEN=$(grep -oE 'cfat_[A-Za-z0-9]+' ../DO_NOT_COMMIT.md | head -1)
   export CLOUDFLARE_ACCOUNT_ID=$(grep -i 'Account ID' ../DO_NOT_COMMIT.md | grep -oE '[a-f0-9]{32}' | head -1)
   printf '%s' "<temp>" | npx wrangler secret put ADMIN_PASSCODE
   ```
   ⚠️ `ADMIN_PASSCODE` also gates the door check-in (`/admin`), so this changes the
   staff door code until removed. Delete it (`wrangler secret delete ADMIN_PASSCODE`)
   to fall back to the existing `GUESTLIST_PASSCODE`. Prefer option 1.

Never write the passcode into a committed file. Use it inline in the curl only.

## Step 1 — Gather the show details

You need: show name, description, venue name, venue address, start & end time, one
or more `{ticketType, price}` pairs, and an image file. If the user gives you an
unstructured blurb, parse it and **confirm anything ambiguous** (year, price,
which orchestra size, etc.) — see the "discrepancies" note below.

### Field rules (enforced server-side; mirror them)
- `showName` ≤200, `description` ≤5000, `venueName` ≤200, `venueAddress` ≤500 — all non-empty.
- `startTime` / `endTime`: **ISO 8601 with an explicit ET offset**. `startTime` must be
  in the **future**; `endTime` after `startTime`.
  - **EDT = `-04:00`** (mid-March → early November) · **EST = `-05:00`** (early Nov → mid-March).
    New England shows: a June/Aug/Sep/Oct show is `-04:00`; a Dec/Jan/Feb show is `-05:00`.
  - Time is the wall-clock start, e.g. 4:30 PM → `T16:30:00`.
- `tickets`: 1–10 items, unique `ticketType`, `price` in **US dollars** (e.g. `64.95`).
- `capacity` *(optional)*: positive integer = total tickets across all types; omit or `null`
  for unlimited. At capacity the show auto-flips to **Sold Out** (via the Square webhook).
- `image`: JPEG/PNG/WebP, ≤5 MB, sent as a **base64 data URL** (see Step 2). Required at create.

## Step 2 — Build the request body (image as a data URL)

Build the JSON in Python so the base64 image embeds safely. Pattern:

```bash
cd /home/leif/legends/legends-website
python3 - <<'PY'
import json, base64
img = base64.b64encode(open('scratch/poster.jpg','rb').read()).decode()
body = {
  "showName": "The Rat Pack with a 12-Piece Orchestra",
  "description": "An evening of Sinatra & the Rat Pack with a full orchestra.\n\nDinner & a show.",
  "venueName": "The Irish American",
  "venueAddress": "177 West St, Malden, MA",
  "startTime": "2026-08-28T16:00:00-04:00",   # 4:00 PM EDT, future
  "endTime":   "2026-08-28T19:00:00-04:00",   # 7:00 PM
  "tickets": [{"ticketType": "Dinner & Show", "price": 64.95}],
  "capacity": 120,                            # optional; omit/None for unlimited
  "image": "data:image/jpeg;base64," + img,   # mime must match the file
}
json.dump(body, open('/tmp/show.json','w'))
print("bytes:", len(json.dumps(body)))
PY
```

Mime ↔ file: `.jpg/.jpeg`→`image/jpeg`, `.png`→`image/png`, `.webp`→`image/webp`.

## Step 3 — POST it

```bash
curl -s -X POST https://djkmdlegends.com/api/admin/events \
  -H "Authorization: Bearer $PASSCODE" -H "Content-Type: application/json" \
  --data @/tmp/show.json -w "\n[HTTP %{http_code}]\n"
```

`200` → `{ "event": { "id": "...", "tickets": [ { "ticketType": "...", "priceCents": 6495 } ],
"capacity": 120, "sold": 0, "soldOut": false } }`. No `checkoutUrl` at create — links are minted
on demand at purchase time. Errors: `400` validation (message names the field), `401` auth, `500` storage.
(Create no longer calls Square, so there's no `502` on create.)

## Step 4 — Verify (mind the cache)

`GET /api/events` is **edge-cached for 60s**, and KV list reads are eventually
consistent — a just-created show may not show immediately. To confirm now:

```bash
# Cache-busted public feed:
curl -s "https://djkmdlegends.com/api/events?cb=$(date +%s)" | python3 -c "import sys,json; [print(e['date'], e['title']) for e in json.load(sys.stdin)['events']]"
# Or the no-store admin list (authoritative, never cached):
curl -s https://djkmdlegends.com/api/admin/events -H "Authorization: Bearer $PASSCODE" | python3 -c "import sys,json; [print(e['id'], e['startTime'][:16], e['showName']) for e in json.load(sys.stdin)['events']]"
# And the image:
curl -s -o /dev/null -w "image: %{http_code} %{content_type}\n" "https://djkmdlegends.com/api/events/$ID/image"
```

## Updating a show — `PATCH /api/admin/events/:id`

JSON, partial — send only what changes. The share link (`/?event=<id>`) is stable across all edits.
- **Metadata** (name, description, venue, dates) → updated in place.
- **`capacity`** (int/null) and **`soldOut`** (bool, manual override) are patchable.
- **`tickets`** → clears the cached on-demand links so the next checkout re-mints at the new price.
- **Image**: `"image": "data:..."` replaces; `"image": null` (or `"removeImage": true`) removes; omit = unchanged.

```bash
# mark a show sold out manually (or set false to re-open)
curl -s -X PATCH https://djkmdlegends.com/api/admin/events/$ID \
  -H "Authorization: Bearer $PASSCODE" -H "Content-Type: application/json" \
  --data '{"soldOut":true}' -w "\n[%{http_code}]\n"
```

```bash
# change a description only
curl -s -X PATCH https://djkmdlegends.com/api/admin/events/$ID \
  -H "Authorization: Bearer $PASSCODE" -H "Content-Type: application/json" \
  --data '{"description":"Updated blurb!"}' -w "\n[%{http_code}]\n"

# replace the image (build the data URL with python as in Step 2, into /tmp/patch.json)
curl -s -X PATCH https://djkmdlegends.com/api/admin/events/$ID \
  -H "Authorization: Bearer $PASSCODE" -H "Content-Type: application/json" \
  --data @/tmp/patch.json -w "\n[%{http_code}]\n"
```

## Removing a show — `DELETE /api/admin/events/:id`

```bash
curl -s -X DELETE https://djkmdlegends.com/api/admin/events/$ID -H "Authorization: Bearer $PASSCODE"
```
Removes the KV record, deactivates any cached/legacy Square link(s), deletes the R2 image.

## Gotchas (learned the hard way)

- **Shell quoting:** never do `H="Authorization: Bearer x"; curl $H` — the space splits the
  word and the token is dropped → silent `401`. Quote it: `-H "$AUTH"`, or inline `-H "Authorization: Bearer $PASSCODE"`.
- **Cloudflare bot block (HTTP `403`, body `error code: 1010`):** the default `python-urllib`
  user-agent is banned at the edge, so a Python `urllib`/`requests` POST fails before it ever
  reaches the worker. `curl` is fine. If you script the create in Python, send a browser UA:
  `req.add_header("User-Agent", "Mozilla/5.0 ... Chrome/124.0 Safari/537.36")`. A `1010` is the
  edge rejecting you, *not* a validation/auth error from our API.
- **Edge cache:** if a new/edited show "isn't showing", it's the 60s cache. Cache-bust or check the admin list before concluding anything's wrong.
- **Future-dated:** create rejects a past `startTime`. (PATCH does not require future, so you can fix/backfill.)
- **Real money:** the `/checkout` endpoint mints **live** production Square links. When testing logic, use the Square **sandbox** via local `wrangler dev` (`SQUARE_ENVIRONMENT=sandbox`, sandbox token + location `LXEVF5FVYSZSC` from `DO_NOT_COMMIT.md`) — never test-spam the production checkout endpoint.
- **Source discrepancies:** owner blurbs are messy (missing year, "12-piece" vs "18-piece", etc.). Verify weekdays with `date -d YYYY-MM-DD +%A`, and surface mismatches to the user instead of guessing.
- **Manage in UI:** humans can list, copy the **share link** (`/?event=<id>`), download its QR, toggle Sold Out, and delete at `/admin → Manage Shows`. You use the API.

## Don't

- Don't add new shows to Google Calendar (deprecated; only the 2 grandfathered shows live there until the ~Sep 2026 cutoff).
- Don't commit secrets, `.dev.vars`, or the passcode.
- Don't redeploy to add a show — it's pure API.
