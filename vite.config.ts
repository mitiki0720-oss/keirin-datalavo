import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const GITHUB_PAGES_BASE = '/keirin-datalavo/'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'github' ? GITHUB_PAGES_BASE : '/',
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/races-page-weather': {
        target: 'https://api.open-meteo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/races-page-weather/, '/v1/forecast'),
      },
    },
  },
}))