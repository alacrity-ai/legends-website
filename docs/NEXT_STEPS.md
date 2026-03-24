## 1. Make the domain, hosting, and email real

This is the first operational milestone. Until this is done, everything else is still a local prototype.

What to do:

- Purchase or transfer `djkmdlegends.com` into Cloudflare.
- Create the Cloudflare Pages project and deploy the site.
- Attach the production domain.
- Configure environment variables in Cloudflare Pages for:
    - booking form endpoint
    - Google Calendar embed URL
    - Google Calendar public URL
    - YouTube video ID
    - mailing list form action, once available
- Configure Cloudflare Email Routing.
- Decide the actual mailbox pattern:
    - `admin@djkmdlegends.com`
    - `booking@djkmdlegends.com`
    - `talent@djkmdlegends.com`
    - `info@djkmdlegends.com`
- Forward all aliases to Keith’s real inbox, and optionally yours.

Why this matters:

- It creates the first real public-facing system.
- It gives the business a professional communications surface immediately.
- It lets you test the actual end-to-end booking path.

Deliverable:

- Public site live on production domain.
- Email aliases functioning.

---

## 2. Replace all placeholder business content with production content

Right now the site is structurally sound, but it does not yet carry commercial weight.

What to gather from Keith:

- Final brand name formatting
- Company description
- Hero headline/subheadline
- Performer roster
- Performer descriptions
- High-quality performer photos
- Contact copy
- Social links
- Real “Book Now” explanatory copy
- Real press-kit description text

What you should do:

- Replace every placeholder string in `content/`
- Replace placeholder images
- Standardize image aspect ratios and optimize them for web
- Tighten copy so the site reads like a business, not a scaffold

Why this matters:

- This is where the site becomes credible to a venue buyer.
- Good structure without real content still feels unfinished.

Deliverable:

- Full production copy and images in place.

---

## 3. Stand up the real booking pipeline

This is the most important business workflow on the site.

What to do:

- Create the actual Formspree project/form.
- Point the site’s booking endpoint at the real Formspree endpoint.
- Configure notification delivery to the real booking inbox.
- Configure the auto-acknowledgment email.
- Write the acknowledgment message carefully:
    - thank them
    - confirm receipt
    - set expectation that someone will respond
- Submit multiple test bookings from different email addresses.
- Verify:
    - form submits successfully
    - Keith receives the booking
    - submitter receives acknowledgment
    - spam filtering is not breaking delivery

What to decide:

- Which fields are actually mandatory
- Whether phone is required
- Whether event type should be dropdown or free text
- Whether to ask estimated guest count or venue name

Why this matters:

- This is the site’s primary conversion surface.
- It must be operational before anything else has much value.

Deliverable:

- End-to-end tested booking workflow.

---

## 4. Create the real calendar operating model

The calendar is not just a UI widget; it is an operational process.

What to do:

- Create or designate the Google account that will own the public calendar.
- Create the production DJKMD Legends calendar.
- Decide what event types belong there:
    - public performances only
    - or also tentative/promotional events
- Populate it with real upcoming appearances.
- Configure calendar visibility for public embedding.
- Replace placeholder embed URL and public URL in the site.
- Test the embed on mobile and desktop.

What to decide:

- Who owns calendar hygiene
- How often events are updated
- What naming convention events should use
- Whether venue links or descriptions should be included

Why this matters:

- A stale calendar erodes trust.
- A real, updated calendar functions as social proof and discovery infrastructure.

Deliverable:

- Public production calendar with a clear maintenance owner.

---

## 5. Build a real press kit

This is one of the most valuable non-code assets in the entire system.

What should go into it:

- Vector logo (`.svg`)
- Transparent PNG logo
- Performer/promotional photos
- Short company boilerplate
- Short descriptions of key acts
- Booking contact info
- Social handles
- Optional one-sheet PDF version later

What to do:

- Collect or create the production assets
- Package them into a clean ZIP
- Give the files sensible names
- Replace the placeholder static press kit in the site

Why this matters:

- Venues, event planners, and partners often need assets quickly.
- It reduces back-and-forth and makes the company feel organized.

Deliverable:

- Real downloadable press kit linked from the site.

---

## 6. Add the mailing list only once there is a real mailing-list strategy

You were correct not to prioritize it prematurely. A mailing list field without an actual content plan is ornamental.

Before wiring it, decide:

- What will people actually receive?
    - upcoming performances
    - show announcements
    - venue appearances
    - promos
- Who will send those emails?
- How often?
- What is the signup incentive?

Once that exists:

- Create the Mailchimp audience
- Create the embedded/signup form
- Wire `VITE_MAILING_LIST_FORM_ACTION`
- Test the full signup flow
- Write a short benefit-oriented CTA, not generic “Join our mailing list”

Why this matters:

- Otherwise you are collecting addresses without a communication system behind them.

Deliverable:

- Working mailing list only after content/ownership is defined.

---

## 7. Replace placeholder media with actual video proof

This is probably the highest-leverage marketing upgrade after bookings.

What to do:

- Select a real hero video or best available clip
- Create or clean up the YouTube channel
- Upload a small set of polished videos
- Choose one flagship embedded video for the site
- Ensure thumbnails and titles look professional

What you should aim for:

- one “what this is” proof video
- a few short clips usable later for ads/social

Why this matters:

- For entertainment, video is proof.
- It will do more persuasion than most copy ever will.

Deliverable:

- Real embedded media and a minimally credible YouTube presence.

---

## 8. Introduce a simple content ownership model

This is where many small business sites decay: nobody owns updates.

You should explicitly assign ownership for:

- calendar updates
- press kit updates
- performer roster changes
- booking inbox monitoring
- social links
- video uploads

This can be very lightweight, but it must exist.

A simple rule set is enough:

- Keith owns calendar and booking inbox
- you own deployment/integration changes
- press kit updates happen when branding/media changes
- performer updates happen as roster changes

Why this matters:

- It prevents the site from becoming stale immediately after launch.

Deliverable:

- Written operating assumptions, even if only in a small internal note.

---

## 9. Add analytics and basic observability

You do not need sophistication yet, but you do need visibility.

What to do:

- Turn on Cloudflare Web Analytics in production
- Verify traffic is being recorded
- Decide what you care about most:
    - total visitors
    - booking CTA clicks
    - completed booking form submissions
    - traffic sources later

Possible next improvement:

- add simple event tracking for:
    - Book Now CTA clicks
    - Press kit downloads
    - Calendar outbound link clicks

Why this matters:

- You need at least minimal evidence of whether the site is doing anything.

Deliverable:

- Basic production analytics.

---

## 10. Do a launch hardening pass

Before calling it live, test it like an outsider.

Test matrix:

- iPhone-sized viewport
- desktop viewport
- booking submission
- press kit download
- calendar display
- email alias routing
- all footer/social links
- image load quality
- spelling/grammar
- metadata/social preview

Also check:

- favicon
- browser tab title
- no placeholder lorem text remains
- no broken image paths
- no dead nav links

Deliverable:

- Production-ready launch checklist signed off.

---

## 11. Then move into Phase 2: demand generation

Only after the above is complete does it make sense to push on growth.

Phase 2 likely begins with:

- creating stronger promo footage
- producing short-form cuts
- setting up Facebook/Instagram and TikTok ad accounts
- creating campaign-specific landing variants if needed
- adding Meta/TikTok pixels later

That is when the site becomes not just a brochure, but an acquisition surface.

---

## Practical sequence I would recommend

Do these next, in this exact order:

1. Put the site on Cloudflare Pages with the real domain.
2. Set up Cloudflare email routing and real aliases.
3. Make the booking form real and fully tested.
4. Create and populate the production Google Calendar.
5. Replace placeholder copy/images with real content.
6. Build the real press kit ZIP.
7. Replace placeholder YouTube media.
8. Turn on analytics.
9. Do launch QA.
10. Add mailing list only once there is a real newsletter/show-announcement plan.
