import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dashboard UI, shown inside the Electron window.
// Dev: served at http://127.0.0.1:5173. Packaged: built to dist/renderer and served by the
// app:// protocol (src/main/appProtocol.js), so absolute paths and client-side routes work.
export default defineConfig({
  root: import.meta.dirname,
  base: '/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  // Loaded from disk, not downloaded, so one large bundle is fine
  build: { outDir: path.resolve(import.meta.dirname, '../dist/renderer'), emptyOutDir: true, chunkSizeWarningLimit: 2500 },
})
