import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local dev: proxy /api to the wrangler dev Worker on :8787 so the PWA and
// the API share an origin exactly like production (admin.djkmdlegends.com
// serves the SPA; admin.djkmdlegends.com/api/* is a Worker route).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
});
