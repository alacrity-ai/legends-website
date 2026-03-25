# SEO Optimization Plan (DJKMD Legends)

## Guiding Strategy

You are optimizing for:

1. **Local + intent-based discovery**
    - “tribute band near me”
    - “celebrity impersonator for event”
    - “hire Elvis impersonator Boston” (eventual)
2. **Conversion-aligned SEO**
    - traffic is only useful if it converts to bookings
3. **Zero backend / static-first**
    - everything must be done via static files + HTML + lightweight additions

---

# Phase 1 — Core SEO Foundation (Do Immediately)

## 1. Harden `index.html` (Primary SEO Surface)

### File

- `index.html`

### Actions

#### 1.1 Add canonical + absolute URLs (you already started this)

```
<link rel="canonical" href="https://djkmdlegends.com/" />  
<meta property="og:url" content="https://djkmdlegends.com/" />
```

---

#### 1.2 Fix Open Graph + Twitter image URLs (absolute)

```
<meta property="og:image" content="https://djkmdlegends.com/assets/images/og-image.jpg" />  
<meta name="twitter:image" content="https://djkmdlegends.com/assets/images/og-image.jpg" />
```

---

#### 1.3 Add `robots` directive

```
<meta name="robots" content="index, follow" />
```

---

#### 1.4 Add `theme-color` (minor but good)

```
<meta name="theme-color" content="#000000" />
```

---

#### 1.5 Add basic geo/local hints (important for your business)

```
<meta name="geo.region" content="US" />  
<meta name="geo.placename" content="United States" />
```

(You can refine later to city-level once you choose a core market.)

---

### Acceptance Criteria

- All metadata uses **absolute URLs**
- Canonical present
- No duplicate/conflicting meta tags
- No placeholder OG image

---

## 2. Add Structured Data (HIGH IMPACT)

Google relies heavily on this for understanding your business.

### File

- `index.html`

### Action

Add JSON-LD inside `<head>`:

```
<script type="application/ld+json">  
{  
  "@context": "https://schema.org",  
  "@type": "EntertainmentBusiness",  
  "name": "DJKMD Legends",  
  "url": "https://djkmdlegends.com",  
  "description": "Live celebrity impersonator and tribute performances for venues and private events.",  
  "image": "https://djkmdlegends.com/assets/images/og-image.jpg",  
  "email": "booking@djkmdlegends.com",  
  "sameAs": [  
    "https://www.instagram.com/...",  
    "https://www.facebook.com/...",  
    "https://www.youtube.com/..."  
  ]  
}  
</script>
```

### Later enhancement

- add address
- add service areas
- add performer-specific structured data (optional)

---

### Acceptance Criteria

- Valid JSON (test in Google Rich Results Test)
- No syntax errors
- Real URLs (not placeholders)

---

## 3. Create `robots.txt`

### File

- `public/robots.txt`

### Contents

```
User-agent: *  
Allow: /  
```
  
Sitemap: https://djkmdlegends.com/sitemap.xml

---

### Acceptance Criteria

- Accessible at:
    - https://djkmdlegends.com/robots.txt
- No disallow rules blocking site

---

## 4. Create `sitemap.xml`

### File

- `public/sitemap.xml`

### Contents (for single-page site)

```
<?xml version="1.0" encoding="UTF-8"?>  
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">  
  <url>  
    <loc>https://djkmdlegends.com/</loc>  
    <changefreq>weekly</changefreq>  
    <priority>1.0</priority>  
  </url>  
</urlset>
```

---

### Future expansion

When you add routes:

- `/acts`
- `/elvis-tribute`
- `/calendar`

Add them here.

---

### Acceptance Criteria

- Accessible at `/sitemap.xml`
- Referenced in `robots.txt`

---

## 5. Add `_redirects` for canonical domain

### File

- `public/_redirects`

### Contents

```
https://www.djkmdlegends.com/* https://djkmdlegends.com/:splat 301
```

---

### Why

- enforces canonical host
- prevents SEO dilution

---

### Acceptance Criteria

- `www` redirects → apex
- no redirect loops

---

# Phase 2 — Content SEO (Very High Impact)

## 6. Improve on-page keyword coverage

### File

- `src/content/site.ts`
- hero/about copy

### Actions

Ensure these phrases appear naturally:

- “celebrity impersonator”
- “tribute performance”
- “live entertainment for events”
- “book entertainment for venue”
- “private events and parties”

Do NOT keyword stuff—just ensure presence.

---

## 7. Add semantic heading clarity

### Files

- Hero / About / Sections

### Rules

- Only ONE `<h1>` → in Hero
- All sections → `<h2>`
- Subsections → `<h3>`

---

### Acceptance Criteria

- Proper heading hierarchy
- No skipped levels

---

## 8. Add alt text rigor

### File

- `performers.ts`

### Action

Ensure alt text is descriptive:

Instead of:

```
"Performer image"
```

Use:

```
"Elvis tribute performer live on stage"
```

---

# Phase 3 — Performance SEO (Already strong, just verify)

## 9. Optimize images

### Files

- `public/assets/images/*`

### Actions

- compress images (target < 200KB each)
- use modern formats where possible (webp if desired)
- maintain consistent aspect ratios

---

## 10. Lazy-load embeds

Ensure:

- YouTube iframe is lazy-loaded
- Calendar iframe is below the fold

---

# Phase 4 — External SEO Setup (Non-code)

## 11. Google Search Console

Do this immediately after deploy:

1. Go to Google Search Console
2. Add property:
    - `https://djkmdlegends.com`
3. Verify via DNS (Cloudflare)
4. Submit:
    - `https://djkmdlegends.com/sitemap.xml`

---

## 12. Google Business Profile (CRITICAL for this business)

This will likely outperform your website early.

- Create listing
- Link to site
- Add photos
- Add services
- Add booking email

---

## 13. Social link consistency

Ensure:

- Same name everywhere
- Same URL everywhere
- Link back to site

---

# Phase 5 — Future SEO Expansion (Do Later)

Not needed for launch, but high ROI later:

## 14. Add real pages (BIG upgrade later)

Instead of SPA-only:

- `/acts/elvis`
- `/acts/sinatra`
- `/book`
- `/calendar`

Each page = new SEO surface

---

## 15. Add blog / updates (optional)

- “Upcoming shows”
- “New performers”
- “Event recaps”

---

# Final Execution Checklist

Do these in order:

1. Update `index.html` (canonical, OG, twitter, robots meta)
2. Add structured data JSON-LD
3. Create `public/robots.txt`
4. Create `public/sitemap.xml`
5. Create `public/_redirects`
6. Replace OG image with real asset
7. Improve hero/about copy with target keywords
8. Verify headings + alt text
9. Deploy
10. Register in Google Search Console
11. Submit sitemap

---

# Reality Check

For THIS business, SEO will matter—but:

- **Video + ads will outperform SEO early**
- SEO becomes powerful once:
    - you have multiple pages
    - you target specific acts / locations

Right now, this plan ensures:

- you are crawlable
- you are indexable
- you look legitimate
- you don’t leave easy wins on the table
