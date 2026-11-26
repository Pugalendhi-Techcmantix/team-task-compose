// Single place that reads Vite env. Values are baked in at build time.
const raw = import.meta.env

export const env = Object.freeze({
  appName: raw.VITE_APP_NAME || 'TaskFlow',
  apiBaseUrl: raw.VITE_API_BASE_URL || '/api/v1',
  // undefined → socket.io-client connects to the page's own origin
  socketUrl: raw.VITE_SOCKET_URL || undefined,
  socketPath: raw.VITE_SOCKET_PATH || '/socket.io',
  // 'cookie' → Laravel Sanctum SPA auth: HttpOnly session cookie + XSRF-TOKEN (default)
  // 'token'  → Bearer token kept in localStorage
  authMode: raw.VITE_AUTH_MODE === 'token' ? 'token' : 'cookie',
  // Sanctum's CSRF route lives outside /api (proxied by Vite and Nginx)
  csrfCookieUrl: raw.VITE_CSRF_COOKIE_URL || '/sanctum/csrf-cookie',
})
