# v0.2 — Event Creation API

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

## Other admin endpoints (unchanged)

| Method & path | Purpose |
| --- | --- |
| `GET /api/admin/events` | List all event records (auth) |
| `DELETE /api/admin/events/:id` | Delete an event; deactivates its Square links + removes the R2 image (auth) |
| `GET /api/events` | Public feed (KV events merged with legacy calendar) |
| `GET /api/events/:id/image` | Public show image |
