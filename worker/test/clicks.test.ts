/**
 * Campaign click tracking (LGD-28): the marketing link goes to our own
 * /go/:slug, which must always send the visitor somewhere sensible and leave
 * exactly one row behind — even when the slug is junk or D1 is broken.
 */
import { describe, expect, it } from 'vitest';
import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index.ts';
import { CAMPAIGN_LINKS } from '../src/clicks.ts';
import { admin, api, createEvent, ORIGIN } from './helpers.ts';

const RATPACK = CAMPAIGN_LINKS.ratpack;

/** Hit the worker directly so we see the 302 itself, and wait for waitUntil. */
async function go(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(ORIGIN + path, { redirect: 'manual', ...init }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const rows = async (): Promise<any[]> =>
  ((await env.SEATING.prepare('SELECT * FROM clicks ORDER BY id').all()).results ?? []) as any[];

describe('GET /go/:slug', () => {
  it('redirects to the campaign destination and records one click', async () => {
    const res = await go('/go/ratpack', {
      headers: { Referer: 'https://mail.google.com/', 'User-Agent': 'TestPhone/1.0' },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(RATPACK);
    // A cached redirect is a click we never see.
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].slug).toBe('ratpack');
    expect(all[0].known).toBe(1);
    expect(all[0].referer).toBe('https://mail.google.com/');
    expect(all[0].user_agent).toBe('TestPhone/1.0');
    expect(all[0].created_at).toBeGreaterThan(0);
  });

  it('tags the channel from ?s= so email and printed cards stay apart', async () => {
    await go('/go/ratpack?s=email');
    await go('/go/ratpack?s=card');
    await go('/go/ratpack?s=%20NOT+a+slug%20'); // junk tag is dropped, click still counts

    const all = await rows();
    expect(all.map((r) => r.source)).toEqual(['email', 'card', null]);
    expect(all).toHaveLength(3);
  });

  it('sends an unknown slug to the homepage rather than a dead end, and still logs it', async () => {
    const res = await go('/go/valentines-2019');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://djkmdlegends.com');

    const [row] = await rows();
    expect(row.slug).toBe('valentines-2019');
    expect(row.known).toBe(0);
  });

  it('never writes a junk slug to the table', async () => {
    const res = await go('/go/' + encodeURIComponent('<script>alert(1)</script>'));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://djkmdlegends.com');
    expect((await rows())[0].slug).toBe('invalid');
  });

  it('is reachable on the /api/go fallback path', async () => {
    const res = await go('/api/go/ratpack');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(RATPACK);
    expect(await rows()).toHaveLength(1);
  });

  it('rejects anything but GET/HEAD', async () => {
    expect((await go('/go/ratpack', { method: 'POST' })).status).toBe(405);
    expect(await rows()).toHaveLength(0);
  });

  it('still redirects when recording throws', async () => {
    const broken = { ...env, SEATING: { prepare: () => { throw new Error('D1 down'); } } } as unknown as typeof env;
    const ctx = createExecutionContext();

    const res = await worker.fetch(new Request(ORIGIN + '/go/ratpack', { redirect: 'manual' }), broken, ctx);
    await waitOnExecutionContext(ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(RATPACK);
  });
});

describe('GET /go/e/:eventId — any show, no code change', () => {
  const ID = '128877d7-7ba0-4754-a063-894dcd6c0194';

  it('redirects to that show and records it under the show slug', async () => {
    const res = await go(`/go/e/${ID}?s=qr`);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`https://djkmdlegends.com/?event=${ID}`);

    const [row] = await rows();
    expect(row.slug).toBe(`event:${ID}`);
    expect(row.source).toBe('qr');
    expect(row.known).toBe(1);
  });

  it('separates channels for the same show', async () => {
    await go(`/go/e/${ID}?s=qr`);
    await go(`/go/e/${ID}?s=share`);
    await go(`/go/e/${ID}?s=email`);

    const all = await rows();
    expect(all.map((r) => r.source)).toEqual(['qr', 'share', 'email']);
    expect(new Set(all.map((r) => r.slug)).size).toBe(1);
  });

  it('is case-insensitive about the id and normalises the slug', async () => {
    const res = await go(`/go/e/${ID.toUpperCase()}`);

    expect(res.headers.get('Location')).toBe(`https://djkmdlegends.com/?event=${ID}`);
    expect((await rows())[0].slug).toBe(`event:${ID}`);
  });

  it('sends a malformed or truncated id to the homepage, never a 404', async () => {
    const res = await go('/go/e/128877d7-7ba0');

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://djkmdlegends.com');

    const [row] = await rows();
    expect(row.slug).toBe('event:invalid');
    expect(row.known).toBe(0);
  });

  it('works on the /api/go fallback path too', async () => {
    const res = await go(`/api/go/e/${ID}`);
    expect(res.headers.get('Location')).toBe(`https://djkmdlegends.com/?event=${ID}`);
  });
});

describe('GET /api/admin/clicks', () => {
  it('needs the admin passcode', async () => {
    expect((await api('/api/admin/clicks')).status).toBe(401);
  });

  it('reports totals per slug and source, newest clicks first', async () => {
    await go('/go/ratpack?s=email');
    await go('/go/ratpack?s=email');
    await go('/go/ratpack?s=card');

    const r = await admin('/api/admin/clicks');
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    const byEmail = r.body.totals.find((t: any) => t.source === 'email');
    expect(byEmail.slug).toBe('ratpack');
    expect(byEmail.clicks).toBe(2);
    expect(Date.parse(byEmail.lastAt)).not.toBeNaN();

    expect(r.body.recent).toHaveLength(3);
    expect(r.body.recent[0].known).toBe(true);
    expect(r.body.recent.map((c: any) => c.source)).toContain('card');
  });

  it('names the show behind a per-show slug', async () => {
    const ev = await createEvent();
    await go(`/go/e/${ev.id}?s=qr`);

    const r = await admin('/api/admin/clicks');
    const row = r.body.totals.find((t: any) => t.slug === `event:${ev.id}`);
    expect(row.show).toBe('Summer GA Show'); // whatever the fixture named it
    expect(row.source).toBe('qr');
    expect(r.body.totals.find((t: any) => t.slug === 'ratpack')?.show ?? null).toBe(null);
  });

  it('filters to one slug', async () => {
    await go('/go/ratpack');
    await go('/go/some-other-show');

    const r = await admin('/api/admin/clicks?slug=ratpack');
    expect(r.body.totals).toHaveLength(1);
    expect(r.body.totals[0].slug).toBe('ratpack');
    expect(r.body.recent.every((c: any) => c.slug === 'ratpack')).toBe(true);
  });
});
