import { applyD1Migrations, env, fetchMock } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach } from 'vitest';

const SQUARE = 'https://connect.squareupsandbox.com';
const MAILGUN = 'https://api.mailgun.net';

// Fresh schema per isolated-storage test.
beforeAll(async () => {
  await applyD1Migrations(env.SEATING, env.TEST_MIGRATIONS);
});

// No test may reach the real Square (or anything else): every outbound fetch is stubbed.
beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
// Interceptors (even persisted ones) survive `deactivate()`; closing the pool
// drops them so one test's Square never answers the next test's calls.
afterEach(async () => {
  await (fetchMock.get(SQUARE) as unknown as { close(): Promise<void> }).close();
  await (fetchMock.get(MAILGUN) as unknown as { close(): Promise<void> }).close();
  fetchMock.deactivate();
});
