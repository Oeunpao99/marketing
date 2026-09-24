import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL lets you point at a non-local backend; default proxies to the
// FastAPI dev server started with `uv run python -m uvicorn app.main:app`.
const API_TARGET = process.env.VITE_API_URL || 'http://localhost:8000'

// Every build gets a version stamp, baked into the JS (__APP_VERSION__) and
// written to dist/version.json. The running app compares the two (see
// src/lib/update.js) to offer "A new version is ready · Update" — installed
// phone apps otherwise resume from memory and keep an old build for days.
const APP_VERSION = new Date().toISOString().slice(0, 16).replace('T', ' ')

const versionFile = {
  name: 'contentflow-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
  },
}

export default defineConfig({
  plugins: [react(), versionFile],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
    },
  },
  // `npm run build && npx vite preview --host` — the production build on your
  // network, e.g. to install the app on a phone. Same proxies as dev.
  preview: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/media': { target: API_TARGET, changeOrigin: true },
    },
  },
})
