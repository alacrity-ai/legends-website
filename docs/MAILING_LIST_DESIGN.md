# Mailing List — Design Document

## 1. Goal

Capture mailing list signups with a simple modal flow. Store email addresses until a proper mailing list provider (Mailchimp) is integrated later. This is an interim solution — the stored emails will be exported and imported into Mailchimp when ready.

**Flow:**
1. User clicks "Join Mailing List" (hero or navbar)
2. Modal appears with email field (required) and name field (optional)
3. User clicks "Join"
4. Worker stores the entry, returns success
5. Modal shows a thank-you message

---

## 2. Storage: Cloudflare KV

Cloudflare Workers are stateless — no filesystem. **Cloudflare KV** is the native solution:

- Key-value store, free tier includes 100k reads/day and 1k writes/day (more than enough)
- Already part of your Cloudflare account — no new service to set up
- Email address as the key = automatic deduplication (writing the same key overwrites, not duplicates)
- Value = JSON with name and signup timestamp
- Can list all keys to export the full list as CSV when migrating to Mailchimp

**Example entry:**
```
Key:   "leif@example.com"
Value: { "name": "Leif", "signedUpAt": "2026-04-01T20:00:00Z" }
```

---

## 3. Architecture

Same pattern as booking and events — modal on frontend, worker endpoint for storage.

```
Browser (Mailing List modal)
  │
  │  POST /api/mailing-list  { email, name? }
  ▼
Cloudflare Worker
  │
  ├─ validate email
  ├─ put to KV (email as key, name + timestamp as value)
  │
  ▼
Return { success: true }
```

---

## 4. Requirements

### Functional

| # | Requirement |
|---|---|
| F1 | Modal with email (required) and name (optional) fields |
| F2 | Worker stores signup in Cloudflare KV |
| F3 | Duplicate emails are silently accepted (idempotent — KV overwrites same key) |
| F4 | Success message shown after signup |
| F5 | Basic email validation (non-empty, contains @) |

### Non-Functional

| # | Requirement |
|---|---|
| NF1 | KV namespace bound to the worker via `wrangler.toml` |
| NF2 | No secrets required — KV binding is configured, not a secret |
| NF3 | CORS works for the new endpoint (already handled by existing worker CORS logic) |

---

## 5. Proposed Design

### 5.1 Worker Changes

**New route:** `POST /api/mailing-list`

**Payload:**
```ts
{ email: string; name?: string }
```

**Handler:**
- Validate email (non-empty, contains @)
- `await env.MAILING_LIST.put(email, JSON.stringify({ name, signedUpAt: new Date().toISOString() }))`
- Return `200 { success: true }`

**Types:** Add `MAILING_LIST: KVNamespace` to the `Env` interface.

**wrangler.toml:** Add KV namespace binding.

### 5.2 Frontend

**New component:** `MailingListModal` — same pattern as `TicketModal`.

- Email field (required)
- Name field (optional)
- "Join" button
- Success state: "You're on the list!"
- Error state: generic error message

**Updated component:** `App.tsx` — add a `MailingList` section placeholder that the `#mailing-list` anchor targets. Or render the modal globally and trigger it from the hero/navbar buttons.

**Approach for triggering the modal:** Since both the hero and navbar buttons need to open the same modal, lift the modal state to `App.tsx`. Pass an `onOpenMailingList` callback down to Hero and Header, or use a simpler approach: make the `#mailing-list` links scroll to a lightweight mailing list section that has an inline signup form (no modal needed).

**Simpler alternative — inline section instead of modal:** Add a `MailingList` section component (like the existing stubbed-out section from the original DESIGN.md) with the email/name form inline. The `#mailing-list` anchor links scroll to it naturally. No modal state management, no prop drilling. The section already has content defined in `site.ts` (`mailingListHeadline`, `mailingListCopy`).

**Recommendation:** Go with the inline section. It's simpler, the content already exists in `site.ts`, and it avoids the complexity of sharing modal state across Header, Hero, and App.

### 5.3 Environment

| Variable | Location | Purpose |
|---|---|---|
| KV namespace `MAILING_LIST` | `wrangler.toml` binding | Stores email signups |

### 5.4 Exporting the List (Future)

When ready to migrate to Mailchimp, run:
```bash
npx wrangler kv key list --binding MAILING_LIST | \
  jq -r '.[].name' | \
  while read email; do
    value=$(npx wrangler kv key get --binding MAILING_LIST "$email")
    name=$(echo "$value" | jq -r '.name // ""')
    echo "$email,$name"
  done > mailing-list-export.csv
```

Or build a simple export script in `tools/`.

---

## 6. Setup Steps (Manual)

1. Create a KV namespace in Cloudflare:
   ```bash
   cd worker
   npx wrangler kv namespace create MAILING_LIST
   ```
   This outputs an ID — add it to `wrangler.toml`.

2. For local dev, create a preview namespace:
   ```bash
   npx wrangler kv namespace create MAILING_LIST --preview
   ```
   Add the preview ID to `wrangler.toml`.

---

## 7. Implementation Steps

### Step 1 — Create KV Namespace (Manual)

Run `wrangler kv namespace create` commands. Add binding to `wrangler.toml`.

### Step 2 — Worker: Add Mailing List Endpoint

- Add `MAILING_LIST: KVNamespace` to `Env` type
- Add validation for email payload
- Add `POST /api/mailing-list` handler to `index.ts`
- Store in KV

### Step 3 — Frontend: Mailing List Service

- Create `src/services/mailing-list.ts` with `joinMailingList(email, name?)`

### Step 4 — Frontend: Mailing List Section Component

- Create `src/components/marketing/MailingList/MailingList.tsx`
- Inline form: email (required), name (optional), "Join" button
- Success/error states
- Uses existing `mailingListHeadline` and `mailingListCopy` from `site.ts`

### Step 5 — Wire Into App

- Add `<MailingList />` to `App.tsx` between BookingForm and PressKit
- Update hero "Join Mailing List" link to `#mailing-list` (already done)

### Step 6 — Local Test

- `docker compose up --build`
- Submit email via the mailing list form
- Verify success message
- Verify entry in KV: `npx wrangler kv key list --binding MAILING_LIST --local`

---

## 8. Resolved Decisions

| # | Decision | Resolution |
|---|---|---|
| Q1 | Storage | Cloudflare KV — free, native to Workers, email as key for deduplication |
| Q2 | Fields | Email (required), name (optional) |
| Q3 | UI pattern | Inline section with form (not modal) — simpler, anchors work naturally |
| Q4 | Deduplication | Automatic via KV key overwrite |
| Q5 | Migration path | Export KV entries to CSV, import into Mailchimp |
