# SOP — Refund or remove tickets (DJKMD Legends)

**Trigger:** a buyer got their money back, or is getting it: *"Keith refunded Roberta one ticket on
Venmo"*, *"those four were refunded, update the guest list"*, a Square "You requested a refund" email,
or the inbox review ([claude_ops legends-inbox-review.md](../../../../claude_ops/docs/sops/legends-inbox-review.md))
flagging **refunded in Square but still on a guest list**.
**Status:** canonical. Built for LGD-37 (2026-10-10); first run took Carol Davis, Ruth W Harris, Linda Dimauro
(Rat Pack Oct 17) and Cindy Agosto (80's Oct 23) off their lists.

> **Golden rules**
> 1. **The money moves first, outside this system.** Keith refunds in Square (dashboard → Transactions →
>    Refund) or pays the buyer back by Venmo, cash or check. This tool never touches money.
> 2. **Then record it through the API** (`tools/record-refund.mjs` →
>    `POST /api/admin/events/:id/parties/:paymentId/refund`). Never delete or edit a `party:` key by hand.
>    `sold` would not move, a seat would stay sold, and without the marker the record leaves behind,
>    a later Square event could put the buyer back.
> 3. **Dry run, read it back, then `--apply`.** Only on Leif's (or Keith's) word that the money went back.
> 4. **No customer email from here.** If the buyer needs telling, that's a Gmail draft for Leif to send
>    ([legends-inbox.md](../../../../claude_ops/docs/sops/legends-inbox.md)), or Keith's call.

---

## 1. Which tool?

| Situation | Do this |
|---|---|
| Square buyer refunded, **all** tickets | `record-refund.mjs --party <paymentId> --method square` |
| Square buyer refunded **some** tickets (Square partial refund, or Keith by Venmo) | add `--qty N` (and `--amount`, if known) |
| Cash/door sale **recorded by mistake** | void it: `record-sale.mjs --void door-…` ([record-cash-sale.md](record-cash-sale.md) §5) |
| Cash/door buyer **refunded** | `record-refund.mjs --party door-… --method cash` (keeps the history; void erases it) |
| Buyer moving to **another show**, money kept | transfer ([transfer-tickets-between-shows.md](transfer-tickets-between-shows.md)) |
| Price difference refunded after a transfer (e.g. Karen Russell's $90 on the Rat Pack move) | **nothing to record**: the tickets stay |

## 2. What recording a refund does

| Thing | After |
|---|---|
| Door list (Check-in) | Fully refunded: gone. Partly: the party shows the tickets they kept, and the note says *"Refunded 1 (Venmo)"* |
| `sold` / Manage Shows | Down by the tickets refunded |
| Seats (seated shows) | A full refund puts the party's seats back on sale. A party keeping some tickets must first be moved to that many seats (Check-in → seats). The API refuses otherwise, because which seats go is a staff choice |
| Check-in | Cleared when nothing is left |
| Sales | The party's amount drops by what went back (`--amount`, or its share of what it paid) |
| KV | `party:<eventId>:<paymentId>` keeps `refunds: [{quantity, method, amountCents?, note?, at}]`. At quantity 0 it stays as the webhook's dedupe marker, hidden everywhere |

A refunded party that was **transferred** is refunded on the show it moved to (that's where its
tickets are). Its refund history stays with that show if it's moved again.

## 3. Prerequisites

```bash
cd ~/lets-get-rich/legends/legends-website
export LEGENDS_ADMIN_PASSCODE=$(agentsecrets get legends_gmail_password)   # same value as the admin passcode; never echo it
```

## 4. Steps

1. **Confirm the money went back.** Square: the "You requested a refund for $X" email (its `refund id: #<paymentId>_…`
   starts with the party id), or `GET https://connect.squareup.com/v2/payments/<paymentId>` with
   `legends_square_prod_access_token` (`refunded_money` vs `amount_money`: full or partial).
   Venmo, cash or check: Leif or Keith says so.
2. **Find the party:** `node tools/record-refund.mjs --show "rat pack" --find stairs`. `--show` takes an event id or a
   fragment that matches exactly one upcoming show.
3. **Dry run:** `node tools/record-refund.mjs --show <id> --party <paymentId> --method square [--qty N] [--amount 42.50] --note "Keith refunded in Square 9/17"`.
   Read back the party, the tickets coming off, and sold before → after.
4. **Apply:** rerun with `--apply`.
5. **Check:** the party is gone from (or reduced on) `/api/admin/events/<id>/guests`, and sold moved.
6. Note it on the card or thread that asked for it.

## 5. Finding refunds that never reached the guest lists

`tools/legends-gmail report` in claude_ops does this every review. It matches every Square refund email to the
parties on upcoming shows, checks Square for full vs partial, and lists the ones still on a list.
Partial refunds there are usually price differences (§1). Ask before recording one.

## 6. Run log

| Date | Show | Party | Refund | Who said |
|---|---|---|---|---|
| 2026-10-10 | Rat Pack Oct 17 | Carol Davis (B8sdj…, 2) | full, Square 9/13 (duplicate booking) | Leif: "Keith handled the four refunded bookings" |
| 2026-10-10 | Rat Pack Oct 17 | Ruth W Harris (7fBa…, 1) | full, Square 9/17 | same |
| 2026-10-10 | Rat Pack Oct 17 | Linda Dimauro (Fgn0…, 3) | full, Square 9/17 | same |
| 2026-10-10 | 80's Legends Oct 23 | Cindy Agosto (bDTw…, 2) | full, Square 9/15 | same |
