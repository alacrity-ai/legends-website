import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `@seating/*` → ../shared/seating: geometry, ids, validation and the SeatMap
// renderer shared with the admin PWA and the Worker (LGD-14).
const seating = fileURLToPath(new URL('./shared/seating', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@seating': seating },
  },
})
