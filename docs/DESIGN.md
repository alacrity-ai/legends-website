# DJKMD Legends Website — Design Document

## 1. Executive Summary

This project delivers the initial public web presence for **DJKMD (Presents) Legends**, a live entertainment company offering celebrity impersonator / actor / singer performances for bars, restaurants, venues, and private events.

The website is intended to be a **low-cost, low-maintenance, mobile-first marketing and booking surface**. It is not a product application, and it does not require a custom backend. Its purpose is to:

- present the brand professionally
- showcase performers and event activity
- provide a frictionless booking path
- capture mailing list signups
- host a downloadable press kit
- embed media and social proof
- remain easy to operate and update over time

The system should be optimized for **simplicity, maintainability, fast page loads, low recurring cost, and high booking conversion**.

This is a static-first architecture deployed on Cloudflare Pages, with third-party integrations used selectively for form submission, mailing list capture, calendar display, and analytics.

---

## 2. Product Goals

### Primary goals

1. **Establish legitimacy**
   - The company must have a polished, credible web presence for venues, talent buyers, and prospective clients.

2. **Drive bookings**
   - The site must make it obvious how to inquire about or book performances.

3. **Show current activity**
   - A visible event calendar provides proof of ongoing operations and upcoming shows.

4. **Support lightweight marketing**
   - The site must support embedded media, mailing list capture, and future ad traffic.

5. **Minimize operational burden**
   - Non-technical operators should be able to update core content through simple external tools where possible.

### Secondary goals

- support downloadable press materials
- support future ad landing traffic
- support future expansion without requiring redesign of the architecture

---

## 3. Non-Goals

The following are explicitly out of scope for the initial implementation:

- custom backend services
- custom authentication / admin portal
- bespoke CMS
- online ticket sales
- payment processing
- complex CRM workflows
- multi-tenant performer management
- automated proposal / quote generation
- advanced personalization
- full e-commerce or merch capabilities

---

## 4. Architectural Principles / Invariants

These are non-negotiable system invariants.

### 4.1 Static-first
The site must be primarily static and deployable as a front-end-only application.

### 4.2 No custom backend
There will be no bespoke Node server, API service, database, or long-running backend process for MVP.

### 4.3 Mobile-first
All page and component design decisions must optimize for mobile usage first, then desktop.

### 4.4 Fast and reliable
Pages must load quickly and degrade gracefully. Third-party integrations must not block first paint more than necessary.

### 4.5 Operational simplicity
Keith or a non-engineer should be able to manage calendar/event content and mailing list activity without code changes where possible.

### 4.6 Low cost
Free-tier or low-cost services should be preferred unless a paid tool meaningfully reduces complexity or risk.

### 4.7 Deterministic structure
The codebase must be organized so another developer can predict where each concern lives and how it is implemented.

### 4.8 Accessibility and clarity
The site should be readable, navigable, and functional across common mobile and desktop environments.

### 4.9 Replaceable integrations
Third-party integrations must be encapsulated so they can be swapped later without architectural disruption.

---

## 5. Technical Stack

## 5.1 Runtime / Language

- **Node.js 24**
- **TypeScript**
- **React**

## 5.2 Frontend Framework / Build

Recommended:
- **Vite**
- **React**
- **TypeScript**

Rationale:
- minimal abstraction
- fast local development
- low cognitive overhead
- appropriate for a marketing site without backend needs

### Why not Next.js for MVP?
Next.js would be defensible, but it introduces additional surface area that is unnecessary for the initial scope. Since there is no backend, no server rendering requirement, and no complex content model, Vite is the simpler and more deterministic choice.

## 5.3 Styling

Recommended:
- **CSS Modules** or **plain scoped CSS files per component**
- optional lightweight design tokens via CSS variables

Avoid:
- overly complex design systems
- CSS-in-JS runtime dependencies unless there is a compelling reason

## 5.4 Hosting / Delivery

- **Cloudflare Pages**
- **Cloudflare DNS**
- **Cloudflare CDN**
- **Cloudflare Web Analytics**

## 5.5 Email / Domain

- domain managed in **Cloudflare**
- email routing via **Cloudflare Email Routing**
- aliases:
  - `admin@djkmdlegends.com`
  - `booking@djkmdlegends.com`
  - `talent@djkmdlegends.com`
  - `info@djkmdlegends.com`

## 5.6 Form Submission

Recommended:
- **Formspree**

Responsibilities:
- receive booking form submission
- send notification email to booking inbox
- send automatic acknowledgment email to submitter

## 5.7 Mailing List

Recommended:
- **Mailchimp**

Responsibilities:
- mailing list capture
- list management
- future campaign support

## 5.8 Event Calendar

Recommended:
- **Google Calendar embed**

Responsibilities:
- public display of upcoming events
- editable by operator without site redeploy

## 5.9 Media

- **YouTube embed** for long-form or placeholder featured video

## 5.10 Press Kit Hosting

- press kit ZIP stored as a static asset in the site or on Cloudflare-hosted public path

---

## 6. High-Level System Context

The website consists of a static React application with several embedded or integrated third-party services:

- React frontend renders all primary site UI
- Google Calendar provides public calendar display
- Formspree handles booking submissions and acknowledgments
- Mailchimp handles mailing list signups
- YouTube provides embedded video playback
- Cloudflare provides hosting, DNS, analytics, and email routing

No site-owned persistence layer exists in MVP.

---

## 7. Site Map / Information Architecture

The site should be implemented initially as a **single-page marketing site** with anchored sections.

This is preferred over a multi-page site for MVP because:
- it reduces routing complexity
- it shortens path-to-booking
- it is easier to maintain
- it is appropriate for current content volume

### Planned sections

1. Header / navigation
2. Hero section
3. About / company overview
4. Performers / acts section
5. Featured video / media section
6. Upcoming events / calendar section
7. Book now / booking section
8. Mailing list signup section
9. Press kit section
10. Footer

A future phase may split some sections into dedicated routes if content volume grows.

---

## 8. Required Component Parts

## 8.1 App Shell

### Responsibilities
- render the global page structure
- wire section order
- provide shared layout container
- define top-level navigation anchors

### Contents
- header
- main content
- footer

---

## 8.2 Header / Navigation

### Responsibilities
- brand presence
- quick navigation to major sections
- persistent booking CTA

### Required elements
- logo / wordmark
- nav links:
  - Home
  - Acts
  - Calendar
  - Book
  - Press Kit
- Book Now button

### Behavior
- mobile: collapsible menu or simplified stacked navigation
- desktop: horizontal nav
- sticky or semi-sticky behavior is acceptable if it does not consume excessive viewport height

---

## 8.3 Hero Section

### Purpose
Immediate articulation of what DJKMD Legends is and why a visitor should continue.

### Required elements
- headline
- short supporting copy
- primary CTA: Book Now
- secondary CTA: View Calendar or Watch Video
- hero image or branded background

### Content intent
The copy must answer:
- what is this?
- what kind of performances are offered?
- who is this for?

### Constraints
- message clarity over cleverness
- above-the-fold mobile readability
- CTA visible without excessive scrolling

---

## 8.4 About Section

### Purpose
Provide concise context about the company and its offering.

### Required elements
- short company description
- summary of event types / venue suitability
- optional trust indicators

### Constraints
- short, scannable
- not text-heavy
- must support cold visitors who do not know the brand

---

## 8.5 Performers / Acts Section

### Purpose
Show what kinds of performances can be booked.

### Required elements
- performer cards or act cards
- image
- title / act name
- short description
- optional tags (e.g. tribute, themed show, live vocals, event-ready)

### Data model
A simple local static array is sufficient for MVP.

Example shape:

```ts
type Performer = {
  id: string;
  name: string;
  imageSrc: string;
  imageAlt: string;
  shortDescription: string;
  tags?: string[];
};
```

### Constraints

- cards must stack cleanly on mobile
- image crop/aspect ratio should be consistent
- copy length should be constrained for visual regularity

---

## 8.6 Media Section

### Purpose

Give visitors immediate performance proof.

### Required elements

- section heading
- embedded YouTube video
- short supporting caption

### MVP behavior

- one featured embedded video
- placeholder acceptable until promotional footage is ready

### Constraints

- must be responsive
- embed should preserve aspect ratio
- lazy-load if feasible

---

## 8.7 Calendar Section

### Purpose

Display upcoming public events / performances.

### Required elements

- section heading
- optional short explanatory copy
- embedded Google Calendar or linked schedule view

### Recommended implementation

- responsive iframe embed
- optionally provide “Open full calendar” link

### Constraints

- if Google Calendar embed is poor on small screens, provide:
    - a simpler embedded view
    - and/or a clear external “View full calendar” CTA

### Operational model

- Keith updates events directly in Google Calendar
- no code changes required for event updates

---

## 8.8 Booking Section

### Purpose

Convert visitors into inquiries.

### Required elements

- short booking intro
- form fields:
    - name
    - email
    - phone (optional)
    - event date
    - venue / location
    - event type (optional dropdown)
    - message / notes
- submit button
- success state messaging

### Integration

- Formspree form endpoint

### Required behaviors

- client-side validation for required fields
- clear success acknowledgment
- clear error state if submission fails
- no page breakage if third-party service is unavailable

### Constraints

- form must be minimal and conversion-oriented
- no unnecessary fields
- mobile keyboard ergonomics should be considered

---

## 8.9 Mailing List Section

### Purpose

Capture visitor interest even when they are not ready to book.

### Required elements

- short incentive copy
- email field
- submit button

### Integration

- Mailchimp embed or API-less embed form

### Constraints

- resistance-free
- visually lightweight
- should not dominate page hierarchy relative to bookings

---

## 8.10 Press Kit Section

### Purpose

Provide downloadable brand and promotional material for venues, clients, and partners.

### Required elements

- short description of what is in the press kit
- download button
- optional file size label

### Press kit contents

- logo SVG
- logo PNG
- performer / promotional photos
- short company overview text
- possibly brand colors / usage note if assets mature later

### Constraints

- ZIP asset must be versionable
- file path should be stable
- asset should be easy to replace during future updates

---

## 8.11 Footer

### Required elements

- copyright
- email contact
- social links
- optional mailing list reinforcement
- optional press kit link

### Constraints

- clean and minimal
- not overloaded

---

## 9. Layout Strategy

## 9.1 Overall Layout

The site will use a vertical, section-based landing page layout with consistent spacing rhythm.

Recommended section order:

1. Header
2. Hero
3. About
4. Performers / Acts
5. Media
6. Calendar
7. Booking
8. Mailing List
9. Press Kit
10. Footer

This order is intentional:

- establish brand and offer first
- show proof / performers second
- show activity and media before ask
- place booking CTA after sufficient context
- capture mailing list as secondary conversion
- expose press kit for partners and venues

## 9.2 Width / Container Strategy

Use a shared max-width container for consistency.

Recommended:

- centered layout container
- generous horizontal padding
- narrower text measures for readability

## 9.3 Responsive Strategy

### Mobile

- single-column layout
- stacked cards
- compressed nav
- full-width CTAs
- limited decorative complexity

### Desktop

- wider content presentation
- multi-column performer grids
- richer spacing and visual hierarchy

---

## 10. UX Requirements

## 10.1 Conversion-first UX

The user should be able to determine within seconds:

- what DJKMD Legends does
- whether the performances are relevant
- how to inquire or book

## 10.2 Friction minimization

Every primary path should minimize clicks and ambiguity.

## 10.3 Visual credibility

The site must feel legitimate and polished even before premium media assets are finalized.

## 10.4 Scannability

Copy should be concise and sectioned. Avoid dense walls of text.

## 10.5 Graceful degradation

If an embedded third-party component loads slowly, the rest of the page must remain usable.

---

## 11. Content Model

MVP content should be mostly code-owned static content, except where external management is beneficial.

### Code-owned static content

- hero text
- about section copy
- performer card data
- press kit description
- footer data
- social link definitions

### Externally managed content

- Google Calendar events
- Mailchimp subscriber list
- Formspree submission flow
- YouTube hosted video

---

## 12. Suggested Project Structure

```
djkmd-legends-site/
  public/
    assets/
      images/
      logos/
      press-kit/
    favicon.ico
  src/
    app/
      App.tsx
      App.css
    components/
      layout/
        Header/
        Footer/
        Section/
        Container/
      marketing/
        Hero/
        About/
        Performers/
        Media/
        Calendar/
        BookingForm/
        MailingList/
        PressKit/
      shared/
        Button/
        Card/
        Heading/
    content/
      performers.ts
      site.ts
      social.ts
    styles/
      tokens.css
      globals.css
    types/
      performer.ts
      site.ts
    main.tsx
  .nvmrc
  package.json
  tsconfig.json
  vite.config.ts
  README.md
```

### Structure rules

- components are grouped by concern
- static content lives in `content/`
- reusable types live in `types/`
- assets live in `public/assets/`
- app shell concerns live in `app/`

---

## 13. Integration Design

## 13.1 Formspree

### Encapsulation rule

Booking form implementation must isolate provider-specific details.

Example:

- keep endpoint URL in environment config or site config
- keep submission logic in a narrow utility / hook

This prevents provider coupling across the component tree.

## 13.2 Mailchimp

### Encapsulation rule

Treat Mailchimp as a single-purpose signup target. The UI should not be tightly coupled to Mailchimp markup beyond what is necessary.

## 13.3 Google Calendar

### Encapsulation rule

Calendar should be wrapped in a dedicated component so provider swap or alternate rendering is localized.

## 13.4 YouTube

### Encapsulation rule

Video embed details should live in a dedicated media component with input props or content config.

---

## 14. Environment / Configuration

Use environment variables only where necessary.

Potential variables:

```
VITE_BOOKING_FORM_ENDPOINT=
VITE_MAILCHIMP_EMBED_URL=
VITE_GOOGLE_CALENDAR_EMBED_URL=
VITE_YOUTUBE_VIDEO_ID=
```

### Rule

No secrets should be required in the deployed front-end bundle for MVP.

If a provider requires a secret, that approach is disallowed for this phase unless replaced with a public embed / hosted integration mechanism.

---

## 15. Accessibility Requirements

At minimum:

- semantic heading structure
- alt text for meaningful images
- accessible form labels
- keyboard navigability
- sufficient color contrast
- visible focus states
- buttons and links must be distinguishable

---

## 16. Performance Requirements

### Goals

- lightweight initial bundle
- responsive mobile experience
- minimal layout shift
- lazy-load non-critical embeds where practical

### Rules

- optimize images
- avoid excessive dependencies
- avoid heavyweight component libraries unless justified
- defer or lazy-load third-party embeds below the fold when possible

---

## 17. SEO / Metadata Requirements

MVP SEO requirements:

- page title
- meta description
- Open Graph title / description / image
- favicon
- canonical domain configuration
- basic structured heading hierarchy

This is sufficient for the launch phase.

---

## 18. Observability / Analytics

Use:

- **Cloudflare Web Analytics**

Track at minimum:

- page visits
- high-level traffic patterns

Future phase may add:

- Meta Pixel
- TikTok Pixel
- conversion event tracking

These are not required for the initial build unless explicitly added later.

---

## 19. Deployment Model

## 19.1 Environments

At minimum:

- local development
- production

Optional:

- preview deployments through Cloudflare Pages PR previews

## 19.2 Production hosting

- Cloudflare Pages serves the static build
- DNS managed in Cloudflare
- custom domain attached to Pages project

## 19.3 Build command

Standard Vite build:

```bash
npm run build
```

## 19.4 Runtime assumption

Pure static asset hosting.

---

## 20. Acceptance Criteria

The implementation is complete when the following are true:

1. The site is live on the production domain.
2. The site is fully usable on common mobile and desktop viewport sizes.
3. Navigation links correctly move to each section.
4. Hero section clearly communicates the business and exposes a visible booking CTA.
5. Performers / acts are rendered from structured content.
6. A YouTube video is embedded and responsive.
7. A public event calendar is visible and functional.
8. Booking form submits successfully through Formspree.
9. User receives clear acknowledgment after booking submission.
10. Mailing list signup is present and functional.
11. Press kit is downloadable from the website.
12. Cloudflare analytics is enabled.
13. The implementation contains no custom backend requirement.

---

## 21. Future Evolution Path

The architecture should leave room for later expansion in the following order:

### Likely next evolutions

1. richer media assets
2. landing pages for ad campaigns
3. dedicated acts pages
4. stronger conversion tracking
5. content editing workflow improvements
6. potential CMS introduction

### Constraint

Future growth must not compromise the MVP’s simplicity without clear business justification.

---

## 22. Final Build Directive

A developer implementing this site should treat this document as the canonical design source.

The expected implementation is:

- a **TypeScript React** application
- built with **Node 24 + Vite**
- deployed on **Cloudflare Pages**
- integrated with:
    - **Cloudflare Email Routing**
    - **Formspree**
    - **Mailchimp**
    - **Google Calendar**
    - **YouTube**
    - **Cloudflare Web Analytics**

The implementation must remain:

- static-first
- mobile-first
- deterministic
- low-cost
- low-maintenance
- conversion-oriented