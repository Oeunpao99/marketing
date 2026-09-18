import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL lets you point at a non-local backend; default proxies to the
// FastAPI dev server started with `uv run python -m uvicorn app.main:app`.
const API_TARGET = process.env.VITE_API_URL || 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
})
