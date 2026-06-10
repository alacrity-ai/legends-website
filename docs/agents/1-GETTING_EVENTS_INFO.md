# Agent runbook — Reading event info

**Audience: you, a coding agent**, asked "what shows are scheduled?", "what's the
payment link / price / date for X?", "give me the id of …", etc.

Companion to `0-ADDING_EVENTS.md` (which covers create/update/delete). Full
contract: `docs/v0.2/event_form/2-API.md`.

## Which endpoint to use

| Need | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| **Everything** about all shows (capacity/sold/soldOut/remaining, imageKey, source) | `GET /api/admin/events` | yes | Authoritative, **never cached** (`no-store`). Default choice. |
| Everything about **one** show | `GET /api/admin/events/:id` | yes | Same fields, single record. |
| What the **public site** shows | `GET /api/events` | no | Merged KV + legacy calendar. **Edge-cached 60s.** Carries `soldOut`; tickets are `{ticketType, priceCents}` (no static link on v0.3 shows). |
| A show's **auto roster + check-ins** | `GET /api/admin/events/:id/guests` | yes | `{ parties, checkedIn }`, built from completed purchases via the webhook. |
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
    { "ticketType": "Dinner & Show", "priceCents": 6495 }   // v0.3: just price configs.
    // (v0.2 shows may also carry legacy checkoutUrl/squarePaymentLinkId/squareOrderId.)
  ],
  "capacity": 120,        // null = unlimited
  "sold": 0,              // advanced by the Square webhook on each completed purchase
  "soldOut": false,       // true at capacity, or set manually
  "remaining": 120,       // capacity − sold (admin list only); null when uncapped
  "createdAt": "2026-05-31T…Z",
  "source": "form"
}
```

Prices are **integer cents** (`priceCents`) — divide by 100 for dollars. v0.3 shows
have **no static `checkoutUrl`** — buyers get a link from `POST /api/events/:id/checkout`.
The shareable per-show URL is `https://djkmdlegends.com/?event=<id>`.

## Recipes

```bash
# All shows, readable summary (capacity/sold + ticket prices)
curl -s https://djkmdlegends.com/api/admin/events -H "Authorization: Bearer $PASSCODE" \
| python3 -c "
import sys,json
for e in json.load(sys.stdin)['events']:
    cap = e.get('capacity'); sold = e.get('sold',0)
    print(e['id'], '|', e['startTime'][:16], '|', e['showName'], '|', e['venueName'],
          '| sold %d/%s%s' % (sold, cap if cap is not None else '∞', ' SOLD OUT' if e.get('soldOut') else ''))
    for t in e['tickets']:
        print('    ', t['ticketType'], '\$%.2f'%(t['priceCents']/100))
"

# Share links to hand out (the site URL that opens each show with the stepper)
curl -s https://djkmdlegends.com/api/admin/events -H "Authorization: Bearer $PASSCODE" \
| python3 -c "import sys,json; [print(e['showName'],'—','https://djkmdlegends.com/?event='+e['id']) for e in json.load(sys.stdin)['events']]"

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
- **No static checkout link on v0.3 shows:** don't expect `tickets[].checkoutUrl`. Buyers
  mint a link via `POST /api/events/:id/checkout` `{ticketType, quantity}`; to hand someone a
  link, give the **share URL** `https://djkmdlegends.com/?event=<id>`. (The 2 v0.2 shows still
  carry a legacy `checkoutUrl`, but the site ignores it and uses the stepper anyway.)
- **Public vs admin shape differ:** public events carry `imageUrl`, `soldOut`, and split
  `date`/`time`; admin records carry raw `startTime`/`endTime` + `imageKey` + `capacity`/`sold`/
  `soldOut`/`remaining`. Pick the endpoint whose shape matches what you need.
- **Legacy calendar events** appear only in the public feed (not the admin list) —
  they're the 2 grandfathered Google Calendar shows, have no `id`/`tickets[]`
  structure, and carry their Square link inside `description`.
- **Past shows:** the public feed is future-only; the admin list returns **all**
  records (including past). Use admin if you need history.
