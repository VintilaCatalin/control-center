import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The existing backend (backend/server.py) is untouched and has no CORS
// headers, so /api/* is proxied here in Vite's Node process instead of
// requesting it directly from the browser - the browser only ever talks
// to this dev server, same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8770',
        changeOrigin: true,
      },
    },
  },
})
