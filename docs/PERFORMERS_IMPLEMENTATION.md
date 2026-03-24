# Performers Carousel Expansion — Implementation Plan

## Problem Statement

The current `Performers` section is architected around a fixed four-card responsive grid. That implementation is acceptable only while the performer roster remains small and static. Once the roster grows beyond four acts, the current layout begins to fail along multiple dimensions:

1. **It does not scale gracefully**
    - Adding more performers will either force an increasingly tall section on mobile and desktop or compress visual hierarchy in undesirable ways.
2. **It does not communicate breadth elegantly**
    - A larger talent roster should feel expansive and dynamic, not like an arbitrarily long stack of cards.
3. **It creates a weak browsing experience**
    - A visitor should be able to move laterally through acts in a deliberate, controlled way, especially on touch devices.

## Solution Summary

We should replace the current fixed grid presentation with a **horizontal performers carousel** that supports:

- a larger performer roster
- horizontal browsing on mobile and desktop
- explicit previous/next navigation
- touch/trackpad scrolling
- deterministic rendering from the existing `performers.ts` content model

For this phase, we will also expand the content model by adding **three new performers**:

- Dolly Pardon
- Amy Winehouse
- Miley Cyrus

The recommended implementation is a **client-side horizontal carousel/scroll rail**, not a dependency-heavy third-party slider library. This preserves the repo’s architectural principles:

- static-first
- low-maintenance
- deterministic
- low-dependency
- mobile-first

For MVP, the correct solution is not a complex animated infinite-loop carousel library. Instead, it should be a **simple, controlled, horizontally scrollable card rail with previous/next controls**, optionally enhanced so navigation wraps from end to beginning and beginning to end. That gives us the functional benefits people colloquially expect from a carousel without importing unnecessary abstraction.

---

# Linear Implementation Steps

## Step 1 — Reframe the Performers section from grid to carousel

### Files to review

- `src/components/marketing/Performers/Performers.tsx`
- `src/components/marketing/Performers/Performers.module.css`

### Goal

Establish that `Performers` is no longer a static grid component. It is now a **carousel-style horizontally scrollable presentation component** for a variable-length roster.

### Required decisions

- Preserve the existing content-driven rendering model.
- Preserve the existing section heading and overall section placement in the page.
- Replace the current `grid` layout with a horizontally scrollable track.
- Add explicit left/right navigation controls.

### Acceptance criteria

- The implementation direction is explicitly carousel-based, not grid-based.
- No new third-party carousel library is introduced.
- The component remains deterministic and content-driven.

---

## Step 2 — Expand the performer content model with three new artists

### Files to edit

- `src/content/performers.ts`

### Goal

Extend the existing static performer dataset so the section now contains seven performers instead of four.

### Required additions

Add three new entries to the `performers` array:

1. Dolly Pardon
2. Amy Winehouse
3. Miley Cyrus

### Notes

- Keep the same `Performer` shape already defined in `src/types/performer.ts`.
- Each new entry must include:
    - `id`
    - `name`
    - `imageSrc`
    - `imageAlt`
    - `shortDescription`
    - optional `tags`

### Example implementation expectations

Each new entry should follow the same structural conventions as the existing ones. For example:

- stable kebab-case IDs
- image paths under `/assets/images/...`
- descriptions of similar length to the current records
- tags aligned with the current card vocabulary

### Acceptance criteria

- `performers.ts` exports seven valid performer objects.
- No existing structure is broken.
- All performers continue rendering from content, not inline JSX literals.

---

## Step 3 — Add the corresponding image assets for the three new performers

### Files/assets to add

- `public/assets/images/performer-dolly.jpg`
- `public/assets/images/performer-amy.jpg`
- `public/assets/images/performer-miley.jpg`

### Goal

Ensure the new content entries resolve to valid assets and do not produce broken image states.

### Requirements

- Asset naming should remain consistent with the current convention:
    - `performer-elvis.jpg`
    - `performer-sinatra.jpg`
    - etc.
- The three new image filenames should match the paths used in `performers.ts`.
- Use appropriately cropped portrait-oriented imagery compatible with the existing `aspect-ratio: 3 / 4`.

### Acceptance criteria

- All seven performers have valid image paths.
- The app renders without broken images.
- The visual crop remains coherent within the card layout.

---

## Step 4 — Replace the grid container with a horizontal track

### Files to edit

- `src/components/marketing/Performers/Performers.tsx`
- `src/components/marketing/Performers/Performers.module.css`

### Goal

Convert the current `.grid` layout into a horizontal scroll track.

### Current problem

The current CSS uses:

- `display: grid`
- single-column on mobile
- two-column at medium width
- four-column at desktop

This model must be removed for the performers list itself.

### New implementation direction

Introduce a structure conceptually like:

- section
- container
- heading
- carousel wrapper
- previous/next controls
- horizontal track
- performer cards as horizontally arranged slides

### Required CSS behavior

The new track should:

- render cards in a single horizontal row
- allow horizontal overflow
- support smooth scrolling
- preserve spacing between cards
- hide or minimize ugly native scrollbar presentation if desired, but not at the expense of usability

### Acceptance criteria

- The performers list is no longer rendered as a multi-row grid.
- Cards render in a horizontal rail.
- The rail can contain an arbitrary number of performers.

---

## Step 5 — Add a dedicated carousel viewport and track structure in JSX

### Files to edit

- `src/components/marketing/Performers/Performers.tsx`

### Goal

Refactor the JSX structure so it supports both the scrollable track and navigation controls cleanly.

### Implementation requirements

Add structural wrappers so the component has, at minimum:

1. a top-level carousel region
2. a viewport element that clips horizontal overflow visually
3. a track element that contains the performer cards
4. previous and next buttons

### Expected conceptual structure

```jsx
<Section ...>  
  <Container>  
    <Heading ... />  
    <div className={styles.carousel}>  
      <button ...>Previous</button>  
      <div className={styles.viewport}>  
        <div className={styles.track}>  
          {performers.map(...)}  
        </div>  
      </div>  
      <button ...>Next</button>  
    </div>  
  </Container>  
</Section>
```

The exact JSX may vary, but the structure should clearly separate:

- navigation controls
- visible window
- scrolling track

### Acceptance criteria

- The component tree now reflects carousel semantics.
- The track is wrapped in a dedicated viewport/container structure.
- Navigation controls are first-class elements in the component.

---

## Step 6 — Introduce a ref-based scroll controller for previous/next navigation

### Files to edit

- `src/components/marketing/Performers/Performers.tsx`

### Goal

Make the carousel navigable via explicit controls, not just manual swipe/scroll.

### Implementation requirements

Use a React ref for the track or viewport element.

Add two deterministic handlers:

- `handlePrevious`
- `handleNext`

These handlers should scroll the track horizontally by a predictable amount.

### Recommended behavior

Use programmatic horizontal scrolling with something like:

- `element.scrollBy({ left: amount, behavior: 'smooth' })`

The scroll amount should be based on card width plus gap, or viewport width fraction, rather than an arbitrary hardcoded magic number if reasonably avoidable.

### Rule

Do not introduce timers, autoplay, or complex animation state for this phase.

### Acceptance criteria

- Clicking previous scrolls left.
- Clicking next scrolls right.
- Scrolling is smooth and deterministic.

---

## Step 7 — Decide and implement wraparound behavior

### Files to edit

- `src/components/marketing/Performers/Performers.tsx`

### Goal

Support the “carousel” expectation that the user can continue cycling through the roster rather than hitting a dead stop.

### Required implementation choice

For this phase, implement **simple wraparound navigation**:

- if the user is at or near the end and clicks next, scroll back to the beginning
- if the user is at or near the beginning and clicks previous, scroll to the end

### Why this approach

This gives the user the practical effect of an “infinite” carousel without introducing:

- cloned slides
- fragile transition bookkeeping
- index virtualization
- dependency-heavy slider behavior

### Implementation notes

You may detect:

- current scroll position
- max scroll position
- near-start / near-end threshold

Then decide whether to:

- scroll by a normal increment
- or jump smoothly back to the opposite boundary

### Acceptance criteria

- Next from the end returns to the beginning.
- Previous from the beginning moves to the end.
- Behavior is stable and does not visually break layout.

---

## Step 8 — Preserve card styling while adapting cards for carousel sizing

### Files to edit

- `src/components/marketing/Performers/Performers.module.css`

### Goal

Ensure the existing performer card styling survives the layout shift without distortion.

### Required changes

The current `.card` can remain visually similar, but it must now behave like a fixed-width or min-width carousel slide rather than a grid item.

### Recommended styling direction

Each slide/card should have something like:

- `flex: 0 0 auto`
- a deliberate width or `min-width`
- consistent spacing from adjacent cards

The width strategy should support:

- approximately one card visible on small mobile
- multiple cards visible on larger screens
- clean snapping/scanning behavior

### Important constraint

Do not allow card widths to collapse unpredictably based on content length.

### Acceptance criteria

- Cards maintain stable visual width.
- The card aesthetic remains coherent with the rest of the site.
- New performers do not distort the layout.

---

## Step 9 — Add optional scroll snapping for improved touch interaction

### Files to edit

- `src/components/marketing/Performers/Performers.module.css`

### Goal

Improve usability on touch devices and trackpads.

### Recommended CSS additions

Use native CSS scroll snapping where appropriate, such as:

- `scroll-snap-type: x mandatory` on the track or viewport
- `scroll-snap-align: start` on each slide/card

### Rationale

This provides a more polished carousel feel while keeping implementation lightweight and browser-native.

### Acceptance criteria

- Horizontal drag/scroll feels intentional on touch devices.
- Cards settle into readable positions rather than stopping awkwardly mid-card.

---

## Step 10 — Add accessible navigation semantics

### Files to edit

- `src/components/marketing/Performers/Performers.tsx`

### Goal

Ensure the carousel is operable and understandable beyond purely visual interaction.

### Requirements

- Previous and next buttons must be real `<button>` elements.
- Buttons must have accessible labels such as:
    - `aria-label="Show previous performers"`
    - `aria-label="Show next performers"`
- The carousel region should be meaningfully identifiable, e.g.:
    - `aria-label="Performer carousel"`

### Optional enhancement

You may also consider:

- disabling buttons when no wraparound is used
- announcing current visible index range later

For this phase, basic accessible button semantics are sufficient.

### Acceptance criteria

- Buttons are keyboard focusable.
- Buttons have meaningful accessible labels.
- The carousel is operable without relying solely on pointer gestures.

---

## Step 11 — Add carousel-specific styles for controls and viewport

### Files to edit

- `src/components/marketing/Performers/Performers.module.css`

### Goal

Create polished but simple visual styling for the navigation controls and track container.

### Required styling concerns

Add styles for:

- carousel wrapper
- viewport
- track
- navigation buttons
- responsive spacing around controls

### Design guidance

The controls should:

- match the existing visual language of the site
- be obvious but not gaudy
- remain usable on mobile
- not obscure the performer cards

### Acceptance criteria

- Controls are visible and usable.
- The viewport clips horizontal overflow cleanly.
- The section looks intentional rather than like a hacked overflow container.

---

## Step 12 — Validate responsiveness across breakpoints

### Files to review/edit

- `src/components/marketing/Performers/Performers.module.css`
- `src/components/marketing/Performers/Performers.tsx`

### Goal

Ensure the new carousel behaves well across the existing responsive design constraints of the site.

### Validation targets

Check at minimum:

- narrow mobile widths
- standard tablet widths
- desktop widths

### What to verify

- no clipped controls
- no horizontal page-level overflow
- track remains scrollable
- cards remain legible
- multiple cards can appear on wider screens without layout instability

### Acceptance criteria

- The carousel behaves cleanly across viewport sizes.
- No global page overflow bug is introduced.
- The component remains mobile-first in behavior.

---

## Step 13 — Remove obsolete grid-only CSS

### Files to edit

- `src/components/marketing/Performers/Performers.module.css`

### Goal

Eliminate stale layout rules that belong to the old implementation model.

### Required cleanup

Remove or rewrite obsolete rules related to:

- `.grid`
- grid-template-column breakpoints
- any grid-specific assumptions no longer used

### Rule

Do not leave dead CSS behind after the carousel conversion.

### Acceptance criteria

- The stylesheet reflects the new layout truthfully.
- There is no grid-only dead code remaining.

---

## Step 14 — Verify that the content model still remains the source of truth

### Files to review

- `src/content/performers.ts`
- `src/components/marketing/Performers/Performers.tsx`

### Goal

Preserve the original architectural invariant: performer cards must remain content-driven and deterministic.

### Requirements

- No performer-specific JSX branches should be introduced.
- No artist data should be embedded directly into the component.
- The carousel should simply render whatever exists in the `performers` array.

### Acceptance criteria

- The component is still a renderer of structured content.
- Adding another performer later requires only:
    - content entry
    - asset
- no component rewrite is needed.

---

## Step 15 — Final validation and cleanup

### Files to review

- `src/content/performers.ts`
- `src/components/marketing/Performers/Performers.tsx`
- `src/components/marketing/Performers/Performers.module.css`
- relevant assets in `public/assets/images/`

### Goal

Ensure the feature is complete, stable, and aligned with the existing repo architecture.

### Final checks

Confirm all of the following:

1. The performer roster now includes:
    - Elvis
    - Sinatra
    - Motown
    - Rat Pack
    - Dolly Pardon
    - Amy Winehouse
    - Miley Cyrus
2. The section renders as a carousel, not a grid.
3. Users can:
    - scroll manually
    - click previous
    - click next
4. Navigation wraps around from end to beginning and beginning to end.
5. No new backend or new dependency is required.
6. The feature remains static-first and content-driven.

### Acceptance criteria

- `npm run dev` renders the updated section correctly.
- `npm run build` succeeds.
- The site remains aligned with the design constraints in `DESIGN.md`.

---

# Definition of Done

This feature is complete when:

1. Three new performer records have been added.
2. Corresponding image assets exist.
3. The `Performers` section no longer uses a fixed grid.
4. The section is rendered as a horizontally scrollable carousel.
5. Previous/next controls function correctly.
6. Carousel navigation wraps around.
7. The implementation remains lightweight, deterministic, and static-first.