# SEO — Implementation Guide

Deterministic steps to close all SEO gaps identified in the audit. The site already has strong semantic HTML, heading hierarchy, alt text, and accessibility. The gaps are in `index.html` meta tags, structured data, and missing crawl/indexing files.

---

## Step 1 — Create OG Image

### Context

The `index.html` references `/assets/images/og-image.jpg` but this file does not exist. Social shares currently show no image. We need a proper OG image.

### File to create

**`public/assets/images/og-image.jpg`**

Use the hero image (`hero.png`) as the base. Convert/resize to meet OG image requirements:
- Format: JPEG (smaller file size for social crawlers)
- Dimensions: 1200x630px (recommended OG size)
- Quality: 85% (balance quality vs size)

### Acceptance criteria
- `public/assets/images/og-image.jpg` exists at 1200x630px.
- File size under 1MB (social platforms reject large images).

---

## Step 2 — Harden index.html Meta Tags

### File to edit

**`index.html`**

Add/fix the following in `<head>`:

1. **Canonical URL:**
   ```html
   <link rel="canonical" href="https://djkmdlegends.com/" />
   ```

2. **Fix OG image to absolute URL:**
   ```html
   <meta property="og:image" content="https://djkmdlegends.com/assets/images/og-image.jpg" />
   ```

3. **Add og:url:**
   ```html
   <meta property="og:url" content="https://djkmdlegends.com/" />
   ```

4. **Add Twitter image:**
   ```html
   <meta name="twitter:image" content="https://djkmdlegends.com/assets/images/og-image.jpg" />
   ```

5. **Add robots directive:**
   ```html
   <meta name="robots" content="index, follow" />
   ```

6. **Add theme-color** (matches site dark background):
   ```html
   <meta name="theme-color" content="#0b0a0f" />
   ```

### Acceptance criteria
- Canonical URL points to `https://djkmdlegends.com/`.
- All OG and Twitter image URLs are absolute (start with `https://`).
- `og:url` tag present.
- `twitter:image` tag present.
- `robots` and `theme-color` meta tags present.

---

## Step 3 — Add JSON-LD Structured Data

### File to edit

**`index.html`**

Add a `<script type="application/ld+json">` block in `<head>` with `EntertainmentBusiness` schema:

```json
{
  "@context": "https://schema.org",
  "@type": "EntertainmentBusiness",
  "name": "DJKMD Legends",
  "url": "https://djkmdlegends.com",
  "description": "Live celebrity impersonator and tribute performances for bars, restaurants, venues, and private events.",
  "image": "https://djkmdlegends.com/assets/images/og-image.jpg",
  "email": "booking@djkmdlegends.com",
  "sameAs": [
    "https://www.instagram.com/djkmdlegends",
    "https://www.facebook.com/djkmdlegends",
    "https://www.youtube.com/@djkmdlegends",
    "https://www.tiktok.com/@djkmdlegends"
  ]
}
```

### Acceptance criteria
- Valid JSON-LD in `<head>`.
- Schema type is `EntertainmentBusiness`.
- Includes name, url, description, image, email, and all 4 social links.
- Passes Google Rich Results Test (manual verification).

---

## Step 4 — Create robots.txt

### File to create

**`public/robots.txt`**

```
User-agent: *
Allow: /

Sitemap: https://djkmdlegends.com/sitemap.xml
```

### Acceptance criteria
- File exists at `public/robots.txt`.
- Allows all crawlers.
- Points to sitemap URL.

---

## Step 5 — Create sitemap.xml

### File to create

**`public/sitemap.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://djkmdlegends.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

Single URL since it's a single-page site. Expand later if pages are added.

### Acceptance criteria
- Valid XML.
- Contains the production URL.
- Accessible at `/sitemap.xml` when deployed.

---

## Step 6 — Create _redirects for Canonical Domain

### File to create

**`public/_redirects`**

Cloudflare Pages supports `_redirects` files for redirect rules:

```
https://www.djkmdlegends.com/* https://djkmdlegends.com/:splat 301
```

This ensures `www.djkmdlegends.com` redirects to the apex domain, preventing SEO dilution from duplicate URLs.

### Acceptance criteria
- File exists at `public/_redirects`.
- www variant redirects to apex domain with 301.

---

## Step 7 — Build and Validate

### Actions

1. Run `npm run build` — confirm no errors.
2. Run `npm run preview` — verify locally:
   - View page source: confirm canonical, OG tags, Twitter tags, JSON-LD all present.
   - Navigate to `/robots.txt` — confirm it loads.
   - Navigate to `/sitemap.xml` — confirm it loads.
   - Navigate to `/assets/images/og-image.jpg` — confirm the image loads.

### Acceptance criteria
- Production build succeeds.
- All meta tags visible in page source.
- `robots.txt` and `sitemap.xml` served as static files.
- OG image loads at the correct path.

---

## Step 8 — Manual: External Verification (Your Steps)

These are actions you take outside the codebase after deploying.

### 8a — Validate Structured Data
- Go to https://search.google.com/test/rich-results
- Enter `https://djkmdlegends.com`
- Confirm EntertainmentBusiness schema is detected with no errors.

### 8b — Validate Social Sharing
- Go to https://developers.facebook.com/tools/debug/
- Enter `https://djkmdlegends.com`
- Confirm OG title, description, and image render correctly.
- Scrape new data if stale.

### 8c — Google Search Console
- Go to https://search.google.com/search-console
- Add property for `djkmdlegends.com` (if not already done).
- Submit the sitemap URL: `https://djkmdlegends.com/sitemap.xml`.
- Request indexing for the main page.

### 8d — Google Business Profile (Optional, High Value)
- Go to https://business.google.com
- Create or claim a listing for "DJKMD Legends".
- Category: "Entertainment agency" or "Live music venue" (whichever fits).
- Link to `https://djkmdlegends.com`.
- This significantly boosts local search visibility.

### Acceptance criteria
- Rich Results Test passes with no errors.
- Facebook debugger shows correct OG image and copy.
- Sitemap submitted in Search Console.
