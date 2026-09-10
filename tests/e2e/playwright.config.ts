/**
 * End-to-end tests for DJKMD Legends.
 *
 * Playwright boots everything itself:
 *   - the booking worker via `wrangler dev` on :8797 with its OWN state dir
 *     (`worker/.wrangler/e2e-state`), test passcode + dummy Square creds
 *   - a production build of the public site on :5183 (no StrictMode
 *     double-mount, so holds behave exactly like djkmdlegends.com)
 *   - a production build of the admin PWA on :5184
 *   - a tiny Square stub on :8798 (lib/square-stub.mjs) that mints links,
 *     serves a one-button "checkout" page and fires the signed webhook, so a
 *     purchase can run end to end offline
 * Real Square is never reached.
 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const WORKER = 'http://localhost:8797';
export const SITE = 'http://localhost:5183';
export const ADMIN = 'http://localhost:5184';
export const SQUARE_STUB = 'http://localhost:8798';
export const PASSCODE = 'e2e-passcode';

const workerVars = [
  `ADMIN_PASSCODE:${PASSCODE}`,
  `ALLOWED_ORIGINS:${SITE},${ADMIN}`,
  'SQUARE_ENVIRONMENT:sandbox',
  'SQUARE_ACCESS_TOKEN:e2e-not-a-token',
  'SQUARE_LOCATION_ID:L-E2E',
  'SQUARE_WEBHOOK_SIGNATURE_KEY:e2e-whsec',
  `SQUARE_API_BASE:${SQUARE_STUB}`,
  'MAILGUN_API_KEY:e2e-mailgun',
  'MAILGUN_DOMAIN:mg.e2e',
  `MAILGUN_API_BASE:${SQUARE_STUB}`,
]
  .map((v) => `--var ${v}`)
  .join(' ');

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: SITE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // The buyers' device: a phone, touch, 2× DPR.
      name: 'phone',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: 'node lib/square-stub.mjs',
      url: `${SQUARE_STUB}/_test/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npx wrangler d1 migrations apply legends-seating --local --persist-to .wrangler/e2e-state && npx wrangler dev --local --port 8797 --persist-to .wrangler/e2e-state ${workerVars}`,
      cwd: `${ROOT}worker`,
      url: `${WORKER}/api/events`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `VITE_BOOKING_API_URL=${WORKER} npx vite build --outDir dist-e2e --logLevel warn && npx vite preview --outDir dist-e2e --port 5183 --strictPort`,
      cwd: ROOT,
      url: SITE,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `VITE_BOOKING_API_URL=${WORKER} npx vite build --outDir dist-e2e --logLevel warn && npx vite preview --outDir dist-e2e --port 5184 --strictPort`,
      cwd: `${ROOT}admin`,
      url: ADMIN,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
