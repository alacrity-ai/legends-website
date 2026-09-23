/**
 * Campaign click tracking (LGD-28). A marketing link points at our own
 * `/go/:slug`, which records the click and 302s on to the real destination —
 * so an email blast or a printed QR card becomes measurable without a third
 * party, a cookie, or a consent banner.
 *
 * Recording runs in `waitUntil`: a D1 hiccup must never cost us a customer.
 */
import type { Env } from './types.ts';
import { NO_STORE, adminPasscode, isAuthorized, jsonResponse } from './http.ts';

const SITE = 'https://djkmdlegends.com';

/**
 * Where each campaign link sends the visitor. One line per campaign — a new
 * one is a one-line change plus a deploy.
 */
export const CAMPAIGN_LINKS: Record<string, string> = {
  // THE RAT PACK, Sat Oct 17 2026 — mailing-list blast + the printed QR cards.
  ratpack: `${SITE}/?event=128877d7-7ba0-4754-a063-894dcd6c0194`,
};

/** Slugs and sources we're willing to write to the table. */
const TOKEN_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** `/go/:slug` and `/api/go/:slug` (the latter rides the existing `/api/*` route). */
const GO_RE = /^\/(?:api\/)?go\/([^/]+)\/?$/;

function normalize(raw: string | null): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const token = decoded.trim().toLowerCase();
  return TOKEN_RE.test(token) ? token : null;
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * One row per click. No IP address and nothing else that identifies a person —
 * this answers "did the campaign work", not "who is this".
 */
export async function recordClick(
  db: D1Database,
  click: { slug: string; source: string | null; known: boolean },
  request: Request,
): Promise<void> {
  const cf = request.cf as { country?: string } | undefined;
  await db
    .prepare(
      `INSERT INTO clicks (slug, source, known, created_at, referer, country, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      click.slug,
      click.source,
      click.known ? 1 : 0,
      Date.now(),
      truncate(request.headers.get('Referer'), 512),
      cf?.country ?? null,
      truncate(request.headers.get('User-Agent'), 256),
    )
    .run();
}

/**
 * `GET /go/:slug` → record, then redirect. Returns null when the path isn't
 * ours, so index.ts can carry on routing.
 *
 * An unknown slug still redirects (to the homepage) and is still recorded: a
 * printed card that outlives its campaign must never dead-end on a 404.
 */
export async function handleGo(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const match = url.pathname.match(GO_RE);
  if (!match) return null;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }

  const slug = normalize(match[1]);
  const known = slug !== null && slug in CAMPAIGN_LINKS;
  const destination = known ? CAMPAIGN_LINKS[slug as string] : SITE;

  ctx.waitUntil(
    recordClick(env.SEATING, { slug: slug ?? 'invalid', source: normalize(url.searchParams.get('s')), known }, request)
      .catch((err) => console.error('Click not recorded:', err instanceof Error ? err.message : err)),
  );

  // no-store: a cached redirect is a click we never see.
  return new Response(null, { status: 302, headers: { Location: destination, ...NO_STORE } });
}

interface TotalRow {
  slug: string;
  source: string | null;
  clicks: number;
  last_at: number;
}

interface ClickRow {
  slug: string;
  source: string | null;
  known: number;
  created_at: number;
  referer: string | null;
  country: string | null;
  user_agent: string | null;
}

/** `GET /api/admin/clicks` — per-slug totals plus the most recent clicks. */
export async function handleAdminClicks(
  request: Request,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' }, corsHeaders);
  }
  if (!isAuthorized(request, adminPasscode(env))) {
    return jsonResponse(401, { error: 'Unauthorized' }, corsHeaders);
  }

  const slug = normalize(url.searchParams.get('slug'));
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);

  try {
    const totals = await env.SEATING.prepare(
      `SELECT slug, source, COUNT(*) AS clicks, MAX(created_at) AS last_at
         FROM clicks ${slug ? 'WHERE slug = ?' : ''}
        GROUP BY slug, source
        ORDER BY clicks DESC`,
    )
      .bind(...(slug ? [slug] : []))
      .all<TotalRow>();

    const recent = await env.SEATING.prepare(
      `SELECT slug, source, known, created_at, referer, country, user_agent
         FROM clicks ${slug ? 'WHERE slug = ?' : ''}
        ORDER BY created_at DESC
        LIMIT ?`,
    )
      .bind(...(slug ? [slug, limit] : [limit]))
      .all<ClickRow>();

    return jsonResponse(
      200,
      {
        totals: (totals.results ?? []).map((r) => ({
          slug: r.slug,
          source: r.source,
          clicks: Number(r.clicks),
          lastAt: new Date(Number(r.last_at)).toISOString(),
        })),
        recent: (recent.results ?? []).map((r) => ({
          slug: r.slug,
          source: r.source,
          known: r.known === 1,
          at: new Date(Number(r.created_at)).toISOString(),
          referer: r.referer,
          country: r.country,
          userAgent: r.user_agent,
        })),
      },
      corsHeaders,
      NO_STORE,
    );
  } catch (err) {
    console.error('Failed to read clicks:', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'Failed to read clicks' }, corsHeaders);
  }
}
