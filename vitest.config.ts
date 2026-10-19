import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

// `npm test` covers the public site only (src/**). shared/seating runs its own
// vitest (make test-shared) and reference_repos/ is not ours to test.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.ts'],
    },
  }),
);
