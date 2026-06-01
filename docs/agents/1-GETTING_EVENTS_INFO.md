# Agent runbook — Reading event info

**Audience: you, a coding agent**, asked "what shows are scheduled?", "what's the
payment link / price / date for X?", "give me the id of …", etc.

Companion to `0-ADDING_EVENTS.md` (which covers create/update/delete). Full
contract: `docs/v0.2/event_form/2-API.md`.

## Which endpoint to use

| Need | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| **Everything** about all shows (payment-link ids, orderId, imageKey, source) | `GET /api/admin/events` | yes | Authoritative, **never cached** (`no-store`). Default choice. |
| Everything about **one** show | `GET /api/admin/events/:id` | yes | Same fields, single record. |
| What the **public site** shows | `GET /api/events` | no | Merged KV + legacy calendar. **Edge-cached 60s.** Limited ticket fields (`checkoutUrl`, no link ids). |
| A show's **image bytes** | `GET /api/events/:id/image` | no | `404` if the show has no image. |

**Rule of thumb:** for anything operational (payment links, management, "is it
really saved?"), use **`GET /api/admin/events`** — it's complete and uncached.
Use the public `GET /api/events` only when you specifically want the
site's-eye view or you don't have the passcode.

## Auth

Admin GETs need `Authorization: Bearer <ADMIN_PASSCODE>` — the passcode you
**cannot read** (see `0-ADDING_EVENTS.md` Step 0; ask the user). The public
`GET /api/events` needs no auth.

## What a record contains (admin GET)

```jsonc
{
  "id": "43c4f19d-…",
  "showName": "The Rat Pack with a 12-Piece Orchestra",
  "description": "…",
  "venueName": "The Irish American",
  "venueAddress": "177 West St, Malden, MA",
  "startTime": "2026-08-28T16:00:00-04:00",   // ISO w/ ET offset
  "endTime":   "2026-08-28T19:00:00-04:00",
  "imageKey":  "events/43c4f19d-….webp",       // null if no image
  "tickets": [
    { "ticketType": "Dinner & Show", "priceCents": 6495,
      "checkoutUrl": "https://square.link/u/Zr2JB2UE",   // the buyer-facing payment link
      "squarePaymentLinkId": "BJ6UYIKBWXD3WLXQ",         // Square ids (management/reconciliation)
      "squareOrderId": "9JIM0vw7i7dGNguolk8kbOZ3a47YY" }
  ],
  "createdAt": "2026-05-31T…Z",
  "source": "form"
}
```

Prices are **integer cents** (`priceCents`) — divide by 100 for dollars.

## Recipes

```bash
# All shows, readable summary
curl -s https://djkmdlegends.com/api/admin/events -H "Authorization: Bearer $PASSCODE" \
| python3 -c "
import sys,json
for e in json.load(sys.stdin)['events']:
    print(e['id'], '|', e['startTime'][:16], '|', e['showName'], '|', e['venueName'])
    for t in e['tickets']:
        print('    ', t['ticketType'], '\$%.2f'%(t['priceCents']/100), t['checkoutUrl'])
"

# Just the payment links
curl -s https://djkmdlegends.com/api/admin/events -H "Authorization: Bearer $PASSCODE" \
| python3 -c "import sys,json; [print(e['showName'],'—',t['ticketType'],t['checkoutUrl']) for e in json.load(sys.stdin)['events'] for t in e['tickets']]"

# Find a show's id by name (then use it for PATCH/DELETE/GET-one)
curl -s https://djkmdlegends.com/api/admin/events -H "Authorization: Bearer $PASSCODE" \
| python3 -c "import sys,json; [print(e['id']) for e in json.load(sys.stdin)['events'] if 'Rat Pack' in e['showName']]"

# One full record by id
curl -s https://djkmdlegends.com/api/admin/events/$ID -H "Authorization: Bearer $PASSCODE" | python3 -m json.tool

# Public, no auth (what the site shows) — cache-bust to see latest
curl -s "https://djkmdlegends.com/api/events?cb=$(date +%s)" \
| python3 -c "import sys,json; [print(e['date'], e.get('time'), e['title']) for e in json.load(sys.stdin)['events']]"
```

## Gotchas

- **Shell quoting:** `-H "Authorization: Bearer $PASSCODE"` — quote it; an unquoted
  var splits on the space and you get a silent `401`.
- **Public feed is cached/eventually-consistent:** the 60s edge cache + KV list lag
  mean a just-created show may be missing from `GET /api/events`. The admin list is
  `no-store` and authoritative — trust it. (If you must hit the public one fresh,
  add `?cb=$(date +%s)`.)
- **Public vs admin shape differ:** public `tickets[]` have only `checkoutUrl`
  (no `squarePaymentLinkId`/`squareOrderId`); public events also carry `imageUrl`
  and split `date`/`time`, while admin records carry raw `startTime`/`endTime` +
  `imageKey`. Pick the endpoint whose shape matches what you need.
- **Legacy calendar events** appear only in the public feed (not the admin list) —
  they're the 2 grandfathered Google Calendar shows, have no `id`/`tickets[]`
  structure, and carry their Square link inside `description`.
- **Past shows:** the public feed is future-only; the admin list returns **all**
  records (including past). Use admin if you need history.
