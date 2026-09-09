# v0.4 — Legends Admin PWA · DESIGN

**Status:** Landed (LGD-4, 2026-08-30). Companion: `1-IMPLEMENTATION.md`.
**Builds on:** v0.2 admin shell + event form, v0.3 multi-event check-in.

## 1. Why

The staff console (Create a Show, Manage Shows, Door Check-in, Mailing List) shipped inside the
**public marketing bundle** at `djkmdlegends.com/admin`, reachable from an **Admin** link in the
public footer. Problems:

- Staff use it on phones at the door; a bookmark inside Safari is not an app. It should be
  **installable** (home-screen icon, standalone window, no browser chrome).
- The public site advertised the staff entrance and shipped ~2.6k lines of admin code to every
  visitor.
- One bundle meant one deploy: a copy change on the marketing site re-shipped the door tool,
  and vice versa.

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| **Host** | `https://admin.djkmdlegends.com` (new Pages project `legends-admin`) | A second Pages project cannot share a *path* on the main host; a PWA wants its own origin/scope (install prompt, `display: standalone`, storage isolated from the public site). `/admin` on the main host would have needed the marketing bundle to keep routing it. |
| **Repo layout** | Same repo, new **`admin/`** app (sibling of `worker/`) | Shares the Worker, the deploy workflow, the design tokens and the docs; the marketing `src/` **loses** the admin code entirely (moved, not copied — no duplication). A separate repo would split one product's history over two places for no gain. |
| **API origin** | Worker gets a **second route** `admin.djkmdlegends.com/api/*`; the PWA calls **relative `/api`** | Same-origin = no CORS preflight at the door on flaky venue wifi; no build-time `VITE_BOOKING_API_URL` needed. Same pattern as kbrelay.com. `ALLOWED_ORIGINS` still gains the admin origin as belt-and-braces (and `localhost:5174` for dev). |
| **PWA pattern** | Borrowed from the Tricorder app (`tng-computer/apps/tricorder`): `manifest.webmanifest` + a **minimal service worker** + brand icons + iOS meta tags | Proven, tiny, no `vite-plugin-pwa` dependency. |
| **Service worker caching** | **None.** `sw.js` only `skipWaiting` / `clients.claim` | The console is one small bundle. A stale sign-in screen or a stale roster at the door is strictly worse than a network round-trip. It also sidesteps the "network-first SW defeated by the HTTP cache" trap. Offline check-in is a possible v0.5 (explicit, versioned caching) — not this. |
| **Auth** | **Unchanged.** Shared passcode, stored in `localStorage["guestlist:passcode"]`, sent as `Authorization: Bearer` on every Worker call; `ADMIN_PASSCODE` secret on the Worker | Out of scope to change the auth model; the lift is behaviour-preserving. Storage is now per-origin, so staff sign in once more on the new host. |
| **Old URLs** | `/admin`, `/admin/*`, `/guestlist` on the public host → **301** to the admin host (`public/_redirects`) | Bookmarks and printed QR codes keep working. The admin app also accepts the legacy `/admin/...` path shapes so redirected deep links land on the right tool. |
| **Discoverability** | Public footer link **removed**; admin host is `noindex` (meta + `X-Robots-Tag`), `robots.txt` Disallow all | Staff tool, not a public surface. |

## 3. Shape

```
admin.djkmdlegends.com  (Pages: legends-admin)          djkmdlegends.com  (Pages: legends-website)
  /              menu (passcode gate)                       /            marketing SPA
  /events/new    Create a Show                              /admin*      301 → admin host
  /events        Manage Shows                               /guestlist   301 → admin host/checkin
  /checkin       Door Check-in
  /mailing-list  Mailing List
  /api/*  ──┐                                               /api/*  ──┐
            └────────── legends-booking-worker (one Worker, two routes) ──┘
                        KV MAILING_LIST / GUESTLIST / EVENTS · R2 EVENT_IMAGES · Square · Mailgun
```

## 4. Non-goals (v0.4)

- No change to the Worker's endpoints, auth, or data.
- No offline mode / background sync.
- No per-user accounts (still one shared passcode).
- No visual redesign — the admin CSS modules moved as-is; only the app shell (`App.tsx`) and
  the global stylesheet (safe-area padding for the notch/home indicator) changed.
