# Mailing List — Implementation Guide

Deterministic, step-by-step execution plan. Follow in order.

**Prerequisite:** Cloudflare KV namespace must be created before Step 2 (Step 1 covers this).

---

## Step 1 — Create KV Namespace (Manual)

### Actions

Run from the `worker/` directory:

```bash
npx wrangler kv namespace create MAILING_LIST
```

This outputs something like:

```
Add the following to your configuration file in your kv_namespaces binding array:
{ binding = "MAILING_LIST", id = "abc123..." }
```

Then create a preview namespace for local dev:

```bash
npx wrangler kv namespace create MAILING_LIST --preview
```

This outputs a preview ID.

### File to edit

**`worker/wrangler.toml`**

Add the KV binding using the IDs from the commands above:

```toml
[[kv_namespaces]]
binding = "MAILING_LIST"
id = "<production-id-from-first-command>"
preview_id = "<preview-id-from-second-command>"
```

### Acceptance criteria
- `wrangler kv namespace list` shows the MAILING_LIST namespace.
- `wrangler.toml` has the KV binding with both production and preview IDs.

---

## Step 2 — Worker: Types and Validation

### File to edit

**`worker/src/types.ts`**

- Add `MAILING_LIST: KVNamespace` to the `Env` interface.

### File to edit

**`worker/src/validation.ts`**

Add a new validation function:

```ts
export function parseMailingListSignup(body: unknown): { email: string; name?: string }
```

- `email` — required, non-empty, must contain `@`
- `name` — optional string
- Reject unexpected fields
- Same pattern as `parseBookingInquiry` but much simpler

### Acceptance criteria
- `Env` includes `MAILING_LIST: KVNamespace`.
- Validation accepts `{ email }` and `{ email, name }`.
- Validation rejects missing email, invalid email, unexpected fields.
- `npx tsc --noEmit` passes.

---

## Step 3 — Worker: Add POST /api/mailing-list Route

### File to edit

**`worker/src/index.ts`**

Add a new route alongside booking and events:

1. Match `POST /api/mailing-list`, return 405 for other methods.
2. Parse and validate the JSON body using `parseMailingListSignup`.
3. Store in KV:
   ```ts
   await env.MAILING_LIST.put(
     email.toLowerCase(),
     JSON.stringify({ name: name ?? null, signedUpAt: new Date().toISOString() })
   );
   ```
   - Key: email (lowercased for deduplication)
   - Value: JSON with name and timestamp
4. Return `200 { success: true }`.
5. On validation error: return `400 { error: message }`.
6. On KV error: `console.error`, return `500 { error: "Failed to save signup" }`.

### Acceptance criteria
- `POST /api/mailing-list` with `{ "email": "test@example.com" }` returns 200.
- `POST /api/mailing-list` with `{ "email": "test@example.com", "name": "Test" }` returns 200.
- `POST /api/mailing-list` with `{}` returns 400.
- `GET /api/mailing-list` returns 405.
- Existing booking and events routes still work.
- `npx tsc --noEmit` passes.

---

## Step 4 — Frontend: Mailing List Service

### File to create

**`src/services/mailing-list.ts`**

```ts
export async function joinMailingList(email: string, name?: string): Promise<void>
```

- Reads worker URL from `import.meta.env.VITE_BOOKING_API_URL` (same as booking/events).
- `POST`s JSON to `{url}/api/mailing-list` with `{ email, name }`.
- Throws on non-2xx or network error.

### Acceptance criteria
- Exports the function.
- URL from env var, not hardcoded.
- Throws on failure.
- `npx tsc -b` passes.

---

## Step 5 — Frontend: Mailing List Section Component

### Files to create

**`src/components/marketing/MailingList/MailingList.tsx`**

An inline section with a simple signup form. Uses existing content from `site.ts`:
- `mailingListHeadline` ("Stay in the Loop")
- `mailingListCopy` (description text)
- `sectionIds.mailingList` ("mailing-list")

**Component structure:**
- `Section` wrapper with `id={sectionIds.mailingList}`
- `Heading` with headline and subtitle
- Inline form with:
  - Email field (required)
  - Name field (optional)
  - "Join" submit button (primary)
- States: `idle`, `submitting`, `success`, `error`
- Success message: "You're on the list! We'll keep you posted on upcoming shows."
- Error message: "Something went wrong. Please try again."
- Basic validation: email required, must contain `@`

**`src/components/marketing/MailingList/MailingList.module.css`**

- Form layout matching BookingForm style (same input/label patterns)
- Max-width ~480px (simpler form, narrower than booking)
- Email and name fields stacked
- Success message styled like BookingForm success state
- Uses existing CSS variables from `tokens.css`

### Acceptance criteria
- Section renders with heading, subtitle, and form.
- Form validates email before submitting.
- Success state shows confirmation message with a "Sign Up Another" reset button.
- Error state shows generic error.
- Styles match the site design system.
- `npx tsc -b` passes.

---

## Step 6 — Wire Into App

### File to edit

**`src/app/App.tsx`**

- Import `MailingList` component.
- Add `<MailingList />` between `<BookingForm />` and `<PressKit />`.

### File to edit

**`src/content/site.ts`**

- Remove `mailingListFormAction` export (no longer using a third-party form action).
- Keep `mailingListHeadline` and `mailingListCopy`.

### File to edit

**`.env.example`**

- Remove `VITE_MAILING_LIST_FORM_ACTION` (no longer used).

### File to edit

**`.github/workflows/deploy.yml`**

- Remove `VITE_MAILING_LIST_FORM_ACTION` from the build env block.

### Acceptance criteria
- Mailing list section appears on the page between booking and press kit.
- `#mailing-list` anchor from hero and navbar scrolls to the section.
- No references to `VITE_MAILING_LIST_FORM_ACTION` remain in source or config.
- Build passes: `npm run build`.

---

## Step 7 — Local Test

### Actions

1. `docker compose up --build`
2. Open `http://localhost:5173`.
3. Click "Join Mailing List" in the hero — page scrolls to the section.
4. Enter an email and optional name, click "Join".
5. Verify success message appears.
6. Submit the same email again — should succeed silently (idempotent).
7. Verify entry stored in local KV:
   ```bash
   cd worker
   npx wrangler kv key list --binding MAILING_LIST --local
   ```

### Acceptance criteria
- Form submits successfully and shows confirmation.
- Duplicate submissions don't error.
- Entry visible in local KV.
- Booking form and events still work (no regression).

---

## Step 8 — Deploy & Verify

### Actions (manual)

1. Deploy worker: `cd worker && npx wrangler deploy`
2. Deploy site via GitHub Actions workflow.
3. On the live site: submit a test email to the mailing list.
4. Verify the entry landed in KV:
   ```bash
   cd worker
   npx wrangler kv key list --binding MAILING_LIST
   ```

### Acceptance criteria
- Live mailing list form submits and shows success.
- Entry exists in production KV namespace.
- All other features still work.
