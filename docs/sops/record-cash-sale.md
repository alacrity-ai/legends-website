# SOP — Record a cash / door sale (DJKMD Legends)

**Trigger:** Keith took money in person — *"Carol Davis paid me cash for 2 tickets to the Divas
show, she wants table 4"* — or gave someone comp tickets, and Leif says *"put her on the list"*.
**Status:** canonical. Built for LGD-33; first run 2026-09-24 (Carol Davis ×2, Divas Oct 18, T4).

> **Golden rules**
> 1. **Always go through the API** (`tools/record-sale.mjs` → `POST /api/admin/events/:id/parties`).
>    Never hand-write a `party:` key: the seats would not be sold in D1 (the table stays on
>    sale online), `sold` would not move, and there would be nothing safe to void later.
> 2. **Dry run, read it back to Leif, then `--apply`.** The dry run is the plan: show, ticket
>    type, seats, money, sold-after. Names arrive loosely; the tool warns when that name or
>    email is already on the show.
> 3. **No money moves here.** Keith has the cash. The record says how he was paid; nothing
>    touches Square. Refunding a cash buyer is Keith's, then void the record (§5).
> 4. **No customer email unless asked.** `--send-confirmation` is a deliberate step, and it
>    needs an email address on the record.

---

## 1. What recording a sale does

| Thing | After |
|---|---|
| **Check-in** for the show | The party is there like any Square buyer, note *"Show Ticket - With Dinner · Cash (Keith)"* — plus a "Transferred from" fragment if it is ever moved |
| **Seating chart** (Check-in → Chart, and the public seat picker) | The seats are **sold** to the party; nobody can hold or buy them online |
| **Manage Shows** sold count | +N; flips to Sold Out at capacity like a Square sale |
| **Sales** | A buyer row tagged with the method (`cash` / `check` / `comp` / `other`). With `--amount`, that amount is the recorded total; without it, the row is *est.* at the ticket price. A comp is `--method comp --amount 0` |
| **Mailing list** | Joined with source `purchase` when an email was given |
| KV | `party:<eventId>:door-<12 hex>` with `recordedSale: { method, takenBy?, note?, at }` — the `door-` id + `recordedSale` mark it as staff-recorded and voidable |

It is **not** a Square order: no Square receipt, no Square refund, no webhook will ever touch it.

## 2. Prerequisites

| Secret id | Used for |
|---|---|
| `legends_gmail_password` | Same value as the admin passcode (`ADMIN_PASSCODE`) — the API bearer |

```bash
cd ~/lets-get-rich/legends/legends-website
export LEGENDS_ADMIN_PASSCODE=$(agentsecrets get legends_gmail_password)   # never echo it
```

## 3. What to get from Keith / Leif before recording

- **Which show** (the tool takes an event id, or a name fragment that matches exactly one
  upcoming show — "rat pack" is ambiguous when two are on sale; use the id).
- **Name**, and ideally **email + phone** — look the buyer up on other shows first
  (`GET /api/admin/events/<id>/guests`); repeat buyers already have both on file.
- **How many tickets, which ticket type.** Shows with two types (show-only vs with dinner)
  need `--type`; the tool refuses to guess.
- **How they paid and how much** (`--method cash|check|comp|other`, `--amount 129.00`). If
  the amount is not known, leave it out: Sales shows the list price marked *est.* Do not
  invent a number.
- **Where they want to sit** on a seated show: `--table T4` takes the first free seats at
  that table; `--seats T4-1,T4-2` names them. Leave both out to record them unassigned and
  seat them later from Check-in.

## 4. Dry run → confirm → apply

```bash
node tools/record-sale.mjs --show 0c03b5e2-920d-458b-9c93-3b504535ca29 \
  --name "Carol Davis" --qty 2 --type "Show Ticket - With Dinner" \
  --email ccdavis1985@gmail.com --phone +19789303443 \
  --method cash --taken-by Keith --note "Cash to Keith, reported 2026-09-24" \
  --table T4                                                      # dry run
```

Read the **WOULD RECORD** block and the *Expected after* sold count back to Leif. On his
go-ahead, re-run the same command with `--apply`. The tool prints the new party id
(`door-…`), its seats, the note staff will see, and the undo command.

Then look at it the way staff will: **Check-in** lists the party with the note; **Chart**
shows the seats taken. The seat state is right at once; the party *list* can lag up to a
minute (KV listing is eventually consistent).

Refusals you will meet, all from the API:

| Response | Meaning |
|---|---|
| `400 Unknown ticket type` | `--type` must be one of the show's configured types, spelled exactly |
| `409 Seats T4-2 are already taken — pick again` | Someone holds or bought them meanwhile; the tool's `--table` pick re-reads on the next run |
| `409 This show has been cancelled` | Restore the show first (Manage Shows) or pick another |
| `400 This show has no seating chart` | Drop `--table` / `--seats` on a general-admission show |

## 5. Void a recorded sale

Recorded in error, or Keith refunded the cash:

```bash
node tools/record-sale.mjs --show <eventId> --void door-xxxxxxxxxxxx           # dry run
node tools/record-sale.mjs --show <eventId> --void door-xxxxxxxxxxxx --apply
```

`DELETE /api/admin/events/<id>/parties/<door-id>`: seats back to available, the party and
its check-in gone, `sold` down by its tickets. Only `door-` parties can be voided — a Square
order answers `409` and is refunded in Square, which then stays on the list as before.

## 6. Telling the buyer (optional, on Leif's say-so)

`--send-confirmation` on the record command (needs `--email`) sends the Legends confirmation
— venue, address, map link, seats, calendar file — and stamps `confirmationSentAt`. Later:
**Check-in → the party → Send confirmation**. The email states the amount only when one was
recorded. Keith normally tells buyers himself; only send when Leif asks.

## 7. What this does not do

- Take a payment. There is no Square order, no card, no receipt from Square.
- Transfer between shows (that is `tools/transfer-tickets.mjs`; a recorded sale moves like any
  other party, but a seated show still refuses transfers).
- Give staff a form for it. The Admin PWA has no "add a party" screen yet; the tool is the
  interface. If Keith starts doing this weekly, that screen is the next ticket.
