import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // '' prefix = also load non-VITE_ vars (dev proxy targets stay server-side only)
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.DEV_API_TARGET || 'http://localhost:8000'
  const socketTarget = env.DEV_SOCKET_TARGET || 'http://localhost:3000'

  const proxy = {
    '/api': { target: apiTarget, changeOrigin: true },
    // Laravel Sanctum CSRF cookie route (cookie auth mode)
    '/sanctum': { target: apiTarget, changeOrigin: true },
    '/socket.io': { target: socketTarget, changeOrigin: true, ws: true },
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // 0.0.0.0 → reachable from other machines on the LAN (http://<your-ip>:<port>)
      host: env.DEV_HOST || true,
      port: Number(env.DEV_PORT) || 5173,
      proxy,
    },
    preview: {
      host: env.DEV_HOST || true,
      port: Number(env.PREVIEW_PORT) || 4173,
      proxy,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.js'],
      css: false,
    },
  }
})
