import axios from 'axios'
import { env } from '../config/env'

export const TOKEN_KEY = 'taskflow_token'

/** true → Sanctum SPA cookie auth (HttpOnly session cookie), false → Bearer token. */
export const COOKIE_AUTH = env.authMode === 'cookie'

export const api = axios.create({
  baseURL: env.apiBaseUrl, // '/api/v1' (VITE_API_BASE_URL)
  timeout: 15000,
  // Always send cookies and copy the XSRF-TOKEN cookie into the X-XSRF-TOKEN header,
  // so Sanctum's HttpOnly session cookie works (harmless in token mode).
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

let authToken = null
let sessionActive = false
let unauthorizedHandler = null

/** Set (or clear with null) the Bearer token used on every request (token mode). */
export function setAuthToken(token) {
  authToken = token || null
}

/** Mark whether a signed-in session exists, so a later 401 means "session expired". */
export function setSessionActive(active) {
  sessionActive = Boolean(active)
}

/** Cookie mode: ask Laravel for a fresh XSRF-TOKEN cookie (call before login / register). */
export async function ensureCsrfCookie() {
  // baseURL '' → the route is /sanctum/csrf-cookie, not /api/v1/sanctum/...
  await api.get(env.csrfCookieUrl, { baseURL: '' })
}

/** Register a callback fired when any authenticated request returns 401. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

api.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status
    const config = error.config

    // 419 = CSRF token mismatch (XSRF cookie expired). Refresh it and retry once.
    if (status === 419 && COOKIE_AUTH && config && !config._csrfRetried) {
      config._csrfRetried = true
      await ensureCsrfCookie()
      return api(config)
    }

    // Only treat 401 as "session expired" when we were signed in
    // (a failed login also returns 401/422 and must not trigger logout).
    if (status === 401 && (authToken || sessionActive) && unauthorizedHandler) {
      unauthorizedHandler()
    }
    return Promise.reject(error)
  },
)

/**
 * List responses → { items, meta }. Handles Laravel resource collections
 * ({ data, links, meta }), plain paginators ({ current_page, data, ... }) and bare arrays.
 * meta = { page, lastPage, perPage, total } or null when not paginated.
 */
export function unwrapPage(res) {
  const body = res?.data
  if (Array.isArray(body)) return { items: body, meta: null }
  const items = Array.isArray(body?.data) ? body.data : []
  const m = body?.meta ?? (body?.current_page !== undefined ? body : null)
  const meta = m
    ? { page: Number(m.current_page), lastPage: Number(m.last_page), perPage: Number(m.per_page), total: Number(m.total) }
    : null
  return { items, meta }
}

/** Laravel resources wrap payloads in { data }. Accept both wrapped and bare. */
export function unwrap(res) {
  const body = res?.data
  if (body === undefined || body === null || body === '') return null
  if (typeof body === 'object' && !Array.isArray(body) && 'data' in body && Object.keys(body).length <= 3) {
    // { data } or { data, links, meta } (paginated resource)
    return body.data
  }
  return body
}
