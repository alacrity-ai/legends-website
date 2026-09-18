# SOP — Transfer tickets from one show to another (DJKMD Legends)

**Trigger:** Keith cancels or reschedules a night and tells buyers *"I'll move your tickets to
the show on the 17th"*, then sends Leif the names. Leif says something like *"move these
people to the Oct 17 show."*
**Status:** canonical. First run 2026-09-18 (Sep 20 Chelmsford Rat Pack → Oct 17 Billerica Rat Pack).

> **Golden rules**
> 1. **Always go through the transfer API** (`tools/transfer-tickets.mjs`). Never hand-edit
>    KV: copying a `party:` key and deleting the old one *looks* right, but the next Square
>    event for that payment (a partial refund of the price difference is the usual one)
>    re-rosters the buyer onto the show they left and re-counts their tickets.
> 2. **Dry run, read the list back to Leif, then `--apply`.** Names in Keith's emails are
>    loose ("Linda dimaoro I think"); the match is confirmed by a human before anything moves.
> 3. **No money moves here.** A transfer never touches Square. Refunds, or the difference
>    between two ticket prices, are Keith's to settle in the Square dashboard.
> 4. **No customer email goes out by itself.** The transfer is silent. Sending the buyer a
>    confirmation for the new show is a separate, deliberate step (§5).

---

## 1. What a transfer does

`POST /api/admin/events/<fromId>/parties/<paymentId>/transfer` `{ "toEventId": "…", "quantity": 1 }`
(`quantity` optional — omit it to move the whole party).

| Thing | After the transfer |
|---|---|
| Door list / Check-in of the **new** show | The party is there, with the note *"Dinner + Show · Transferred from ‹old show› (Sep 20)"* |
| Door list of the **old** show | The party is gone (or shows the tickets that stayed, on a partial move) |
| **Manage Shows** sold counts | old show −N, new show +N (the new show flips to Sold Out if that reaches capacity) |
| **Sales** | The money follows the tickets: what the buyer actually paid is carried over, even though the new show's tickets are priced differently |
| Check-in on the old show | Removed (whole-party moves) |
| KV | `party:<toId>:<paymentId>` written with `transferredFrom`; `party:<fromId>:<paymentId>` **kept** with `quantity: 0` + `transferredOut` — the marker that stops Square re-rostering them. Every list skips it. |

Moving part of a party (Ruth keeps 1, moves 1) splits the quantity and the amount paid. Moving
the rest later merges into the same party on the new show.

**Not supported yet:** either show having a reserved-seating chart (the API answers `409`).
Seats live in D1 and would need releasing and re-picking.

## 2. Prerequisites

| Secret id | Used for |
|---|---|
| `legends_gmail_password` | Same value as the admin passcode (`ADMIN_PASSCODE`) — the API bearer |

```bash
cd ~/lets-get-rich/legends/legends-website
export LEGENDS_ADMIN_PASSCODE=$(agentsecrets get legends_gmail_password)   # never echo it
```

## 3. Find the shows and the people

Show ids: **Legends Admin → Manage Shows** (the id is in the edit URL), or
`GET /api/admin/events`. Then list the matches on the source show — nothing is written:

```bash
node tools/transfer-tickets.mjs --from <fromId> --to <toId> \
  --find "dziadosz,davis,johola,rager,russell,dimauro,brown,harris"
```

Search loosely (surname fragments, email fragments) and check the output for:

- **Two orders under one name** (Carol Davis bought 2 + 2 on the same day). Each is its own
  party; decide with Leif/Keith whether both move.
- **A buyer who typed an email as their name** — search by the email fragment.
- **"Transfer 1 ticket"** when the party holds 2 → a partial move (`<paymentId>:1`).
- **Someone not on the list at all** — they may have bought through a legacy Square link
  that never rostered. Stop and ask; do not invent a party.

## 4. Dry run → confirm → apply

```bash
node tools/transfer-tickets.mjs --from <fromId> --to <toId> \
  --move <paymentId> --move <paymentId> --move <paymentId>:1          # dry run
```

Read the "Would transfer" list and the expected sold counts back to Leif. On his go-ahead,
re-run the same command with `--apply`. The script prints both shows before and after;
the after-counts must equal the "Expected after" line.

> The **sold** counts are right immediately. The "parties / tickets on the list" figure for the
> new show can lag by up to a minute (KV key listing is eventually consistent) — on the first
> run it still read "1 parties / 10 tickets" straight after the move and was correct 12 s
> later. Re-run without `--move` to re-read before worrying.

Then look at it the way staff will: **Check-in** for the new show lists the people with the
"Transferred from" note; **Manage Shows** shows the new counts.

Undo = transfer back the other way (`--from` and `--to` swapped). The marker left on the
original show is harmless.

## 5. Telling the buyer (optional, on Leif's say-so)

The new show's Legends confirmation (venue, address, map link, calendar file) can be sent
per party from **Check-in → the party → Send confirmation**, or
`POST /api/admin/events/<toId>/parties/<paymentId>/confirmation`. Note that email states
the total the buyer paid for the *original* tickets. Keith normally tells buyers himself;
only send when Leif asks.

## 6. What this does not do

- Cancel the old show. If the night is off, mark it Sold Out (stops sales) or delete it in
  Manage Shows once every party has been moved or refunded — see who is left on its door list.
- Refund anyone, or settle a price difference between the two shows.
