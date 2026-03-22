import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import dotenv from 'dotenv'

// Load .env so EXPRESS_PORT / VITE_DEV_PORT / VITE_API_PORT are set (see docs/REPLICATE-PORTS-CONFIG.md)
dotenv.config({ path: path.join(process.cwd(), '.env') })

const viteDevPort = parseInt(process.env.VITE_DEV_PORT, 10) || parseInt(process.env.VITE_PORT, 10) || 5174
const apiPort = parseInt(process.env.VITE_API_PORT, 10) || parseInt(process.env.EXPRESS_PORT, 10) || 3001
const proxyTarget = process.env.VITE_PROXY_TARGET || `http://localhost:${apiPort}`
const base = process.env.VITE_BASE || '/'

// https://vitejs.dev/config/
export default defineConfig({
  base,
  publicDir: 'public',
  // Expose S3_* so S3_COLOR_PALETTES_JSON_URL is available to the app (palette catalog fetch + cache; see color-palette-utils-ts/README-ts.md).
  envPrefix: ['VITE_', 'S3_'],
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), '.')
    }
  },
  server: {
    port: viteDevPort,
    strictPort: false, // If port in use, try next (5174, 5175, ...)
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    }
  }
}) 