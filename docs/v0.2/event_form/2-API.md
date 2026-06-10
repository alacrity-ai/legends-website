# v0.2 — Event Creation API

> **⚠️ Superseded by v0.3 ("Option E").** As of v0.3, **create makes no Square calls** —
> it stores ticket price configs + an optional `capacity`; checkout links are minted on
> demand by `POST /api/events/:id/checkout` (priced for the buyer's chosen quantity), and
> the share/QR target is the site URL `https://djkmdlegends.com/?event=<id>`. The current
> contract lives in `public/openapi.json` (served at `/docs`) and the
> `docs/agents/*` runbooks; see `docs/v0.3/DESIGN_V2.md`. The text below describes the
> retired v0.2 link-per-ticket behavior and is kept for history.

`POST /api/admin/events` creates a show. It powers the admin form **and** can be
called programmatically — same URL, same auth, same field contract. Two body
formats are accepted, chosen by `Content-Type`:

- `multipart/form-data` — used by the admin form (`payload` JSON part + `image` file part)
- `application/json` — programmatic; image supplied as base64 / a data URL

Everything a successful call does is identical either way: validate → create one
Square payment link per ticket type → store the image in R2 → persist to KV.

## Auth

Bearer token = the admin passcode (the same one that gates `/admin`):

```
Authorization: Bearer <ADMIN_PASSCODE>
```

Missing/wrong token → `401`.

## JSON request body

```jsonc
{
  "showName": "Sinatra Under the Stars at the Elks",
  "description": "An evening of Sinatra & the Rat Pack with a full orchestra.",
  "venueName": "Chelmsford Elks",
  "venueAddress": "22 Linwood St, Chelmsford, MA",
  "startTime": "2026-09-20T19:00:00-04:00",   // ISO 8601 WITH offset (ET: -04:00 EDT / -05:00 EST)
  "endTime":   "2026-09-20T22:00:00-04:00",   // must be after startTime; startTime must be in the future
  "tickets": [
    { "ticketType": "Show Only",     "price": 45 },   // price in USD dollars
    { "ticketType": "Dinner + Show", "price": 75 }
  ],
  "image": "data:image/jpeg;base64,/9j/4AAQ..."        // data URL (self-describes mime)
}
```

Image, two accepted forms:
- `"image": "data:image/jpeg;base64,<...>"` — a data URL (preferred; carries the mime type)
- `"image": "<base64>"` together with `"imageType": "image/jpeg"` — raw base64 + explicit mime

Constraints (same as the form): all fields required; 1–10 ticket types with
unique names and `price > 0`; image must be JPEG/PNG/WebP and ≤ 5 MB (decoded).

## Response

`200`:
```jsonc
{ "event": { "id": "…", "showName": "…", "tickets": [ { "ticketType": "Show Only", "priceCents": 4500, "checkoutUrl": "https://square.link/u/…", … } ], … } }
```

Errors: `400` validation (message says which field), `401` auth,
`502` Square rejected a ticket (nothing is saved), `500` storage failure.

## curl example

```bash
# Build the body (turn a local image into a data URL, then assemble JSON)
IMG_DATA_URL="data:image/jpeg;base64,$(base64 -w0 poster.jpg)"
jq -n --arg img "$IMG_DATA_URL" '{
  showName: "Sinatra Under the Stars at the Elks",
  description: "An evening of Sinatra & the Rat Pack with a full orchestra.",
  venueName: "Chelmsford Elks",
  venueAddress: "22 Linwood St, Chelmsford, MA",
  startTime: "2026-09-20T19:00:00-04:00",
  endTime:   "2026-09-20T22:00:00-04:00",
  tickets: [ {ticketType:"Show Only", price:45}, {ticketType:"Dinner + Show", price:75} ],
  image: $img
}' > body.json

curl -sS -X POST https://djkmdlegends.com/api/admin/events \
  -H "Authorization: Bearer $ADMIN_PASSCODE" \
  -H "Content-Type: application/json" \
  --data @body.json
```

The returned `event.id` and per-ticket `checkoutUrl`s can be managed/deleted from
`/admin` → Manage Shows (which also offers Copy link / Download QR per ticket).

## Update an event — `PATCH /api/admin/events/:id`

`application/json`, partial. Send only the fields you want to change; the rest
stay as they are. Same auth (`Authorization: Bearer <ADMIN_PASSCODE>`). Returns
`{ "event": <updated record> }`.

Updatable fields: `showName`, `description`, `venueName`, `venueAddress`,
`startTime`, `endTime`, `tickets`, and the image (below). At least one change is
required (`400 No fields to update` otherwise).

**Checkout links:**
- Metadata edits (name, description, venue, dates) **keep the existing Square
  links** — so links/QR codes you've already shared keep working.
- Sending `tickets` **mints fresh Square links** for the new set and deactivates
  the old ones (Square checkout prices can't be edited in place). This changes
  the `checkoutUrl`s — re-share / re-print QRs after a price change.

**Image:**
- `"image": "data:image/png;base64,..."` (or base64 + `"imageType"`) — replace
- `"image": null`  or  `"removeImage": true` — remove the image entirely
- omit — leave the image unchanged

Examples:
```bash
# Change just the description (checkout links untouched)
curl -X PATCH https://djkmdlegends.com/api/admin/events/$ID \
  -H "Authorization: Bearer $ADMIN_PASSCODE" -H "Content-Type: application/json" \
  --data '{"description":"New blurb with a special guest!"}'

# Change prices / ticket types (mints new checkout links)
curl -X PATCH .../api/admin/events/$ID -H "Authorization: Bearer $ADMIN_PASSCODE" \
  -H "Content-Type: application/json" \
  --data '{"tickets":[{"ticketType":"Dinner & Show","price":69.95}]}'

# Replace the image
IMG="data:image/webp;base64,$(base64 -w0 poster.webp)"
jq -n --arg img "$IMG" '{image:$img}' | curl -X PATCH .../api/admin/events/$ID \
  -H "Authorization: Bearer $ADMIN_PASSCODE" -H "Content-Type: application/json" --data @-

# Remove the image
curl -X PATCH .../api/admin/events/$ID -H "Authorization: Bearer $ADMIN_PASSCODE" \
  -H "Content-Type: application/json" --data '{"removeImage":true}'
```

## Delete an event — `DELETE /api/admin/events/:id`

Auth required. Removes the KV record, deactivates the event's Square payment
link(s), and deletes its R2 image. Returns `{ "ok": true }` (or `404` if the id
isn't found). Also available from `/admin → Manage Shows`.

```bash
curl -X DELETE https://djkmdlegends.com/api/admin/events/$ID \
  -H "Authorization: Bearer $ADMIN_PASSCODE"
```

## Other endpoints

| Method & path | Purpose |
| --- | --- |
| `GET /api/admin/events` | List all event records, full detail incl. payment-link ids (auth) |
| `GET /api/admin/events/:id` | One full event record by id (auth) |
| `GET /api/events` | Public feed (KV events merged with legacy calendar; edge-cached 60s) |
| `GET /api/events/:id/image` | Public show image (`404` if the event has no image) |
