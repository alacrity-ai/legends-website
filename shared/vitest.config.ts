// Self-contained so vitest stops here instead of walking up to the site's
// vite.config.ts (which imports `vite` from the root workspace — not installed
// when only `shared/` is set up, e.g. the CI unit job).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['seating/**/*.test.ts'],
  },
});
