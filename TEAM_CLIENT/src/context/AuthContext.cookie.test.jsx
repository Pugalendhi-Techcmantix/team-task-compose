import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

vi.mock('../config/env', () => ({
  env: { apiBaseUrl: '/api/v1', authMode: 'cookie', csrfCookieUrl: '/sanctum/csrf-cookie' },
}))

const me = vi.fn()
const login = vi.fn()
vi.mock('../api/auth', () => ({
  authApi: { me: (...a) => me(...a), login: (...a) => login(...a), logout: vi.fn(), register: vi.fn() },
}))

const { AuthProvider, useAuth } = await import('./AuthContext')

let auth
function Probe() {
  auth = useAuth()
  return <p data-testid="status">{auth.status}</p>
}
const renderAuth = () => render(<AuthProvider><Probe /></AuthProvider>)
const status = () => screen.getByTestId('status').textContent

describe('AuthContext in cookie mode', () => {
  beforeEach(() => {
    me.mockReset()
    login.mockReset()
    localStorage.clear()
  })

  it('restores the session from the HttpOnly cookie via /auth/me and drops old tokens', async () => {
    localStorage.setItem('taskflow_token', 'old-bearer-token')
    me.mockResolvedValue({ id: 1, name: 'Demo' })
    renderAuth()
    expect(status()).toBe('loading')
    await waitFor(() => expect(status()).toBe('authenticated'))
    expect(auth.token).toBeNull()
    expect(localStorage.getItem('taskflow_token')).toBeNull()
  })

  it('is a guest when /auth/me returns 401', async () => {
    me.mockRejectedValue(new Error('401'))
    renderAuth()
    await waitFor(() => expect(status()).toBe('guest'))
  })

  it('signs in without a token in the response', async () => {
    me.mockRejectedValueOnce(new Error('401')).mockResolvedValueOnce({ id: 1, name: 'Demo' })
    login.mockResolvedValue({ user: { id: 1 }, token: null })
    renderAuth()
    await waitFor(() => expect(status()).toBe('guest'))
    await act(() => auth.login({ email: 'a@b.c', password: 'secret123' }))
    expect(status()).toBe('authenticated')
    expect(auth.user).toEqual({ id: 1, name: 'Demo' })
    expect(localStorage.getItem('taskflow_token')).toBeNull()
  })

  it('explains a rejected cookie (backend not stateful for this site)', async () => {
    me.mockRejectedValue(new Error('401'))
    login.mockResolvedValue({ user: { id: 1 }, token: null })
    renderAuth()
    await waitFor(() => expect(status()).toBe('guest'))
    await expect(auth.login({ email: 'a@b.c', password: 'secret123' })).rejects.toThrow(/SANCTUM_STATEFUL_DOMAINS/)
    expect(status()).toBe('guest')
  })
})
