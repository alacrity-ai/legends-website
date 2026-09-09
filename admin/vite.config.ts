import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `@seating/*` → ../shared/seating: geometry, ids, validation and the SeatMap
// renderer shared with the public site and the Worker (LGD-14). `dedupe`
// pins react to admin/node_modules so the shared component and the app never
// load two React copies.
const seating = fileURLToPath(new URL('../shared/seating', import.meta.url));

// Local dev: proxy /api to the wrangler dev Worker on :8787 so the PWA and
// the API share an origin exactly like production (admin.djkmdlegends.com
// serves the SPA; admin.djkmdlegends.com/api/* is a Worker route).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@seating': seating },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5174,
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
