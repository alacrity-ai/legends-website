/**
 * Worker integration tests run INSIDE workerd via @cloudflare/vitest-pool-workers:
 * real (local) D1 / KV / R2 bindings from wrangler.toml, isolated per test, with
 * outbound `fetch` (Square) stubbed through `fetchMock`. `make test-worker`.
 *
 * Pinned to vitest 3.2 + pool 0.12: the 0.13+ line requires vitest 4 and drops
 * `fetchMock` (the declarative outbound-request mock every Square test relies on).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => ({
  resolve: {
    alias: { '@seating': path.join(here, '../shared/seating') },
  },
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: await readD1Migrations(path.join(here, 'migrations')),
            ADMIN_PASSCODE: 'test-passcode',
            ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:5174',
            SQUARE_ENVIRONMENT: 'sandbox',
            SQUARE_ACCESS_TOKEN: 'sq-test-token',
            SQUARE_LOCATION_ID: 'L-DEFAULT',
            SQUARE_WEBHOOK_SIGNATURE_KEY: 'whsec-test',
            MAILGUN_API_KEY: 'mg-test',
            MAILGUN_DOMAIN: 'mg.test',
            GOOGLE_API_KEY: 'g-test',
            LEGACY_CALENDAR_ENABLED: 'false',
          },
        },
      },
    },
  },
}));
