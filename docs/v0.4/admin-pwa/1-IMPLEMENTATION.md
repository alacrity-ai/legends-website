# v0.4 — Legends Admin PWA · IMPLEMENTATION

**Status:** Landed (LGD-4, branch `admin-pwa`, 2026-08-30). Design: `0-DESIGN.md`.

## 1. Code moves (`git mv` — history preserved)

| From (`src/`) | To (`admin/src/`) |
| --- | --- |
| `components/admin/Admin.tsx` + `.module.css` | `app/App.tsx` + `app/App.module.css` (routes rebased from `/admin/...` to `/...`; legacy `/admin/...` shapes still accepted) |
| `components/admin/{AdminSignIn,EventForm/,ManageShows/,MailingList/}` | `components/admin/…` (unchanged) |
| `components/guestlist/*` | `components/guestlist/*` (unchanged) |
| `services/{admin-events,guestlist,mailing-list-admin}.ts` | `services/…` — `apiUrl` now imported from `services/api-base.ts` |
| `utils/qr.ts`, `utils/eastern-time.ts`, `types/guestlist.ts` | same paths (marketing site had no remaining users) |

Copied (still needed by the public site too): `styles/tokens.css`, `styles/globals.css`.

Public site: `src/app/App.tsx` lost `isAdminRoute()` + the `<Admin />` branch; `Footer.tsx` lost
the Admin link; `public/_redirects` gained the three 301s **above** the SPA fallback.

## 2. New files

| File | Purpose |
| --- | --- |
| `admin/package.json` | Same deps as the site (`react`, `react-dom`, `qrcode-generator`); `wrangler` as a devDep for `make deploy-admin` |
| `admin/vite.config.ts` | Dev server **:5174**; proxies `/api` → `http://localhost:8787` (wrangler dev) so dev is same-origin like prod |
| `admin/tsconfig*.json` | Copied from the root (strict, bundler resolution) |
| `admin/index.html` | Title "Legends Admin", `noindex`, `theme-color #0b0a0f`, manifest link, apple-touch-icon + iOS standalone meta, same Google Fonts as the site |
| `admin/src/main.tsx` | Mounts `App`; registers `/sw.js` |
| `admin/src/services/api-base.ts` | `export const apiUrl = import.meta.env.VITE_BOOKING_API_URL ?? ''` — relative by default |
| `admin/public/manifest.webmanifest` | `display: standalone`, `orientation: portrait`, `id`/`start_url`/`scope` = `/`, icons 192 / 512 / 512-maskable |
| `admin/public/sw.js` | Minimal, **no caching** (see design §2) |
| `admin/public/icons/` | `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` (180), `favicon-32.png` — the *Legends* logo on the brand background (`#0b0a0f`), generated with Pillow from `public/assets/images/logo_legends.webp` |
| `admin/public/_redirects` | `/* /index.html 200` (SPA fallback) |
| `admin/public/_headers` | `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`; `sw.js` `Cache-Control: no-cache`; manifest content-type |
| `admin/public/robots.txt` | `Disallow: /` |
| `docs/v0.4/admin-pwa/` | These two docs |

Config touched: `worker/wrangler.toml` (second `[[routes]]` for `admin.djkmdlegends.com/api/*`;
`ALLOWED_ORIGINS` += admin origin + `http://localhost:5174`), `Makefile` (`dev-admin`,
`build-admin`, `deploy-admin`, `install`/`clean` cover `admin/`), `eslint.config.js` (ignore
`admin/dist`; root `eslint .` lints `admin/src`), `.github/workflows/deploy.yml` (admin build +
Pages deploy step between the site and the worker).

## 3. Cloudflare steps 🧑‍💻

Creds only via `agentsecrets` (`claude_ops/docs/sops/agentsecrets.md`); never printed.
`legends_cloudflare_token` can manage Pages + Workers but **cannot read or write DNS** on
`djkmdlegends.com` — DNS needs `cloudflare_dns_token` (verified 2026-08-30).

| # | Step | How |
| --- | --- | --- |
| 1 | Create Pages project **`legends-admin`** (production branch `main`) | `wrangler pages project create legends-admin --production-branch main` (or the REST API) |
| 2 | DNS: **CNAME `admin` → `legends-admin.pages.dev`, proxied** in zone `djkmdlegends.com` (`80f71b5fc9570ec1d8aa92c112581d66`) | REST `POST /zones/:id/dns_records` with `cloudflare_dns_token` |
| 3 | Add custom domain **`admin.djkmdlegends.com`** to the project | REST `POST /accounts/:id/pages/projects/legends-admin/domains` |
| 4 | Deploy the Worker (new route + CORS var) | `make deploy-worker` |
| 5 | First admin deploy | `make deploy-admin` (→ `wrangler pages deploy admin/dist --project-name legends-admin`) |
| 6 | Thereafter | The GitHub Actions workflow does all three artifacts |

Fresh-hostname TLS can return curl `000` for ~90 s after step 3 — cert provisioning, not a bug.

## 4. Verification checklist

- [ ] `curl -sI https://admin.djkmdlegends.com/` → `200`, HTML, `x-robots-tag: noindex`
- [ ] `/manifest.webmanifest` → `200`, `application/manifest+json`; `/sw.js` → `200`, `cache-control: no-cache`; `/icons/icon-192.png` → `200`
- [ ] `curl -s https://admin.djkmdlegends.com/api/events` → events JSON (Worker answering on the admin host)
- [ ] `curl -sI https://djkmdlegends.com/admin` → `301` `location: https://admin.djkmdlegends.com/`; `/guestlist` → `…/checkin`; `/admin/events` → `…/events`
- [ ] Public site: no Admin link in the footer; `dist/` contains no `guestlist`/`EventForm` strings
- [ ] Phone viewport (390 px): sign-in (wrong code → error; right code → menu), Manage Shows lists real shows, Door Check-in loads a roster, Mailing List loads + CSV button, Create a Show renders (**do not submit a real show**)
- [ ] Install: Chrome shows the install prompt / iOS Share → Add to Home Screen; opens standalone with the gold *Legends* icon
- [ ] `make lint`, `make build`, `make build-admin` all clean

## 5. Rollback

- **Admin app broken:** Cloudflare Pages → `legends-admin` → roll back to the previous deployment (or `make deploy-admin` from a known-good commit). The Worker and public site are unaffected.
- **Need the old in-bundle console back:** revert the `admin-pwa` merge on `main` and run the deploy workflow — that restores `src/components/admin`, the footer link, and the `/admin` route; leave the extra Worker route in place (harmless). Alternatively, only re-point `public/_redirects` if the goal is just to stop redirecting.
- **Worker route problem:** remove the `admin.djkmdlegends.com/api/*` `[[routes]]` block and `make deploy-worker`; then set `VITE_BOOKING_API_URL=https://djkmdlegends.com` for the admin build so it falls back to the cross-origin API (CORS already allows the admin origin).
