import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AxiosError } from 'axios'

vi.mock('../config/env', () => ({
  env: { apiBaseUrl: '/api/v1', authMode: 'cookie', csrfCookieUrl: '/sanctum/csrf-cookie' },
}))

const { api, COOKIE_AUTH, ensureCsrfCookie, onUnauthorized, setSessionActive } = await import('./client')

/** Fake transport: each call gets the next status in `statuses` (200 when exhausted). */
function fakeAdapter(statuses) {
  const calls = []
  const adapter = async (config) => {
    calls.push(config)
    const status = statuses.shift() ?? 200
    const response = { status, data: {}, headers: {}, config, statusText: '' }
    if (status >= 400) throw new AxiosError('fail', 'ERR_BAD_RESPONSE', config, null, response)
    return response
  }
  return { adapter, calls }
}

describe('api client in cookie mode', () => {
  let original
  beforeEach(() => {
    original = api.defaults.adapter
  })
  afterEach(() => {
    api.defaults.adapter = original
    setSessionActive(false)
  })

  it('sends cookies and the XSRF header', () => {
    expect(COOKIE_AUTH).toBe(true)
    expect(api.defaults.withCredentials).toBe(true)
    expect(api.defaults.withXSRFToken).toBe(true)
  })

  it('fetches the CSRF cookie from /sanctum, not under /api/v1', async () => {
    const { adapter, calls } = fakeAdapter([204])
    api.defaults.adapter = adapter
    await ensureCsrfCookie()
    expect(calls[0].baseURL).toBe('')
    expect(calls[0].url).toBe('/sanctum/csrf-cookie')
  })

  it('on 419 refreshes the CSRF cookie and retries once', async () => {
    const { adapter, calls } = fakeAdapter([419, 204, 200])
    api.defaults.adapter = adapter
    const res = await api.post('/tasks', { title: 'x' })
    expect(res.status).toBe(200)
    expect(calls.map((c) => c.url)).toEqual(['/tasks', '/sanctum/csrf-cookie', '/tasks'])
  })

  it('gives up after one 419 retry', async () => {
    const { adapter, calls } = fakeAdapter([419, 204, 419])
    api.defaults.adapter = adapter
    await expect(api.post('/tasks', {})).rejects.toMatchObject({ response: { status: 419 } })
    expect(calls).toHaveLength(3)
  })

  it('treats 401 as "session expired" only while signed in (no token needed)', async () => {
    const handler = vi.fn()
    const off = onUnauthorized(handler)
    api.defaults.adapter = fakeAdapter([401]).adapter
    await api.get('/auth/me').catch(() => {})
    expect(handler).not.toHaveBeenCalled()

    setSessionActive(true)
    api.defaults.adapter = fakeAdapter([401]).adapter
    await api.get('/tasks').catch(() => {})
    expect(handler).toHaveBeenCalledTimes(1)
    off()
  })
})
