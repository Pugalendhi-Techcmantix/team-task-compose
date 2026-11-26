import { api, COOKIE_AUTH, ensureCsrfCookie, unwrap } from './client'

/** Normalises { user, token } | { data: { user, token } } | { access_token } shapes. */
function toSession(payload) {
  const p = payload ?? {}
  return { user: p.user ?? null, token: p.token ?? p.access_token ?? null }
}

// Paths are relative to VITE_API_BASE_URL (/api/v1 on the TaskFlow backend).
export const authApi = {
  async login({ email, password }) {
    if (COOKIE_AUTH) await ensureCsrfCookie()
    return toSession(unwrap(await api.post('/auth/login', { email, password })))
  },

  async register({ name, email, password, password_confirmation }) {
    if (COOKIE_AUTH) await ensureCsrfCookie()
    return toSession(
      unwrap(await api.post('/auth/register', { name, email, password, password_confirmation })),
    )
  },

  async logout() {
    await api.post('/auth/logout')
  },

  async me() {
    const data = unwrap(await api.get('/auth/me'))
    return data?.user ?? data
  },
}
