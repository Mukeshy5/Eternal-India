import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: process.env.ETERNAL_INDIA_API_TARGET || 'http://127.0.0.1:5000', changeOrigin: true, ws: true } },
  },
})
