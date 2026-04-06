# Payments Planning

Next steps for enabling ticket sales via Square.

---

## 1. Create Square Account

- Sign up at [squareup.com](https://squareup.com) using `djkmd@lalalimited.com`
- Set business name to "DJKMD Legends"
- Select business type: Entertainment / Events (or closest match)

## 2. Complete KYC & Banking (Keith)

Keith needs to complete these in the Square dashboard:

- Identity verification (name, SSN/EIN, date of birth)
- Business verification (business name, address, type)
- Link bank account for payouts
- This must be done before Square will process live payments

## 3. Integrate Square Payments for Ticket Sales

Once the Square account is active and verified:

- Get Square Application ID and Access Token from the Square Developer Dashboard
- Store the access token as a Cloudflare Worker secret (same pattern as Mailgun)
- Add a `POST /api/tickets` worker endpoint that creates a Square payment
- Update the ticket modal to collect card details via the Square Web Payments SDK
- Replace the "coming soon" placeholder with a real checkout flow
- Test with Square sandbox credentials before going live

## 4. Mailing List Opt-In at Purchase

- Add a pre-checked checkbox to the ticket modal: **"Keep me posted on upcoming shows and announcements"**
- On successful purchase, if the box is checked, the worker writes the customer's email and name to the `MAILING_LIST` KV in the same request that creates the ticket — no extra API call from the frontend
- Pre-checked is CAN-SPAM compliant since the user sees the option and can uncheck it before purchasing
