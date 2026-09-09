# SOP — Send a mailing-list campaign email (DJKMD Legends)

**Trigger:** Leif says something like *"Send out an email to our mailing list promoting event XYZ."*
**Status:** canonical. Campaigns are **always human-triggered** — there is no cron, no automation.
This SOP exists so the agent can take a one-line request and produce a branded, compliant,
tested send.

> **Golden rules**
> 1. **Test-first, always.** Render a preview, send a test to **leiftaylor@gmail.com**, and get
>    Leif's explicit go-ahead on the *test email in his inbox* before any `--all` send.
>    "Send the campaign" at the start of a request is *not* approval of the final email.
> 2. **Never print subscriber emails** into the terminal/context. The tooling reports counts only.
> 3. **Never bypass suppression.** The send script excludes unsubscribed entries automatically;
>    don't hand-roll a send that skips that filter.

---

## 1. The pipeline at a glance

```
campaign spec (JSON, written per request)
  → scripts/campaign-template.mjs  (branded HTML + plain-text)
  → scripts/send-campaign.mjs      (--preview | --to <email> | --all)
  → Mailgun batch API on mg.djkmdlegends.com
```

- Recipients come from the **MAILING_LIST KV** (the unified list: form signups + ticket
  buyers + imports, deduped by email). Entries with `unsubscribedAt` are always skipped.
- Every email carries a per-recipient **unsubscribe link** (HMAC-tokened, served by the
  worker at `/api/mailing-list/unsubscribe`) plus `List-Unsubscribe` /
  `List-Unsubscribe-Post: One-Click` headers (Gmail/Yahoo bulk-sender requirement).
- Unsubscribes are stored back onto the KV entry (kept, never deleted, so a later ticket
  purchase can't resubscribe someone). They show as a red badge in **Legends Admin → Mailing List** (`https://admin.djkmdlegends.com/mailing-list`).

## 2. Prerequisites (agentsecrets)

| Secret id | Used for |
|---|---|
| `legends_mailgun_api_key` | Mailgun sends (domain is hardcoded: `mg.djkmdlegends.com`) |
| `legends_unsubscribe_secret` | Minting unsubscribe tokens (same value as the worker's `UNSUBSCRIBE_SECRET`) |
| `legends_cloudflare_token` + `cloudflare_account_id` | Reading MAILING_LIST / EVENTS KV via the CF REST API |

Golden pattern — inline, never printed:

```bash
cd ~/lets-get-rich/legends/legends-website/worker
MAILGUN_API_KEY=$(agentsecrets get legends_mailgun_api_key) \
UNSUBSCRIBE_SECRET=$(agentsecrets get legends_unsubscribe_secret) \
CLOUDFLARE_API_TOKEN=$(agentsecrets get legends_cloudflare_token) \
CLOUDFLARE_ACCOUNT_ID=$(agentsecrets get cloudflare_account_id) \
node scripts/send-campaign.mjs --spec <spec.json> <mode>
```

## 3. Write the campaign spec

A small JSON file (scratchpad is fine for one-offs; commit recurring ones under
`worker/campaigns/` if Leif wants them kept). Fields:

```jsonc
{
  "subject": "The Rat Pack returns — Aug 28 in Malden",   // required, ≤ ~60 chars, truthful
  "preheader": "12-piece orchestra, dinner & show",        // inbox preview text, complements subject
  "headline": "The Rat Pack, Live with a 12-Piece Orchestra", // required, the big gold line
  "intro": ["1–3 short paragraphs of body copy."],         // required, array of strings
  "eventId": "43c4f19d-…",   // optional — pulls name/date/venue/prices/image from EVENTS KV
                             // and defaults the CTA to the ticket-modal deep link
  "cta": { "label": "Get Tickets", "url": "https://djkmdlegends.com/?event=…" }, // optional override
  "outro": ["Optional closing lines (muted styling)."],    // optional
  "tag": "rat-pack-aug-28"   // optional Mailgun tag for stats; default "campaign"
}
```

With `eventId` set, the email gets an **event card**: poster image
(`/api/events/<id>/image`), show name, gold date line (authored ET wall-clock, never
UTC-shifted), venue, and a price line from the ticket types.

### Copy guidance

- Voice: warm, a little showbiz, concise — this is a night out, not a newsletter.
- Subject states the real content (CAN-SPAM: no misleading subjects). Include the hook
  (show + date or city) since that's all most inboxes show.
- 1–3 short intro paragraphs max; the event card and CTA do the heavy lifting.
- **One CTA per email.** Two shows to promote = two event cards is fine, but still lead
  with one primary CTA; or better, ask Leif to split into two sends.

## 4. Design rules (what "branded" means)

Implemented in `campaign-template.mjs` — change the template, not per-send HTML:

- **Stage-dark + gold**, matching djkmdlegends.com: bg `#0c0a12`, card `#16121f`,
  border `#2a2438`, gold `#d4af37`, text `#e8e4da`, muted `#b8b2a6`.
- **Sections, in order:** hidden preheader → logo (PNG at
  `/assets/images/logo_legends_email.png` — email-safe; the site's webp logos are not) →
  gold rule → gold serif headline → intro copy → event card → gold CTA button → muted
  outro → footer.
- **Footer is non-negotiable:** why-you-got-this line, postal address, unsubscribe link.
- Email-client constraints the template already respects: 600px table layout, inline
  styles only, Georgia serif stack (web fonts don't work in email), bulletproof
  table-based CTA button, `role="presentation"`, plain-text alternative part.

## 5. The workflow

```bash
# 1. Find the event id (matches the site's Upcoming Shows feed)
curl -s https://djkmdlegends.com/api/events | python3 -m json.tool | grep -B1 -A3 '"title"'

# 2. Write the spec, then render a local preview (sends nothing)
node scripts/send-campaign.mjs --spec spec.json --preview
# → review campaign-preview.html yourself (read it / screenshot it) before bothering Leif

# 3. Test send — to Leif only
... --spec spec.json --to leiftaylor@gmail.com

# 4. STOP. Leif checks his inbox. Iterate on the spec + re-test until he approves.

# 5. Real send — only after explicit approval of the test email
... --spec spec.json --all                      # everyone not unsubscribed
... --spec spec.json --all --source signup      # or a consent-tier segment
```

Report back: recipient count, batch message ids, and the unsubscribed/skipped counts the
script prints. Delivery check if wanted:

```bash
curl -s --user "api:$(agentsecrets get legends_mailgun_api_key)" \
  "https://api.mailgun.net/v3/mg.djkmdlegends.com/events?event=delivered&limit=5" | python3 -m json.tool | grep -c '"delivered"'
```

## 6. Compliance checklist (all automatic via the script — verify, don't re-implement)

- [x] Working per-recipient unsubscribe link in the footer (worker route, one click, no login)
- [x] `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers (RFC 8058)
- [x] Suppression honored on every send; explicit form re-signup is the only un-suppress
- [x] Physical postal address in the footer — ⚠ currently the placeholder
      `DJKMD Presents Legends · Chelmsford, MA` in `campaign-template.mjs`
      (`POSTAL_ADDRESS`). **Get the real business mailing address from Leif and update it.**
- [x] Truthful subject/from: `DJKMD Legends <events@mg.djkmdlegends.com>`, reply-to
      `booking@djkmdlegends.com`
- Segmenting note: `import`-source entries never explicitly opted in. For anything
  aggressive/frequent, prefer `--source signup,purchase`; flag the choice to Leif.

## 7. Gotchas

- **KV is eventually consistent (~60s).** A just-unsubscribed address can appear
  subscribed to an immediate `--all` list read. Don't send within a minute of testing
  unsubscribe flows.
- The unsubscribe route lives on the **worker** — worker deploys (via the repo's
  `deploy.yml` GitHub Action) must be green before a send that links to it.
- Mailgun batches cap at 1000 recipients/message; the script chunks at 900 automatically.
- `--preview` writes `campaign-preview.html`/`.txt` into `worker/` — they're throwaway;
  don't commit them.
