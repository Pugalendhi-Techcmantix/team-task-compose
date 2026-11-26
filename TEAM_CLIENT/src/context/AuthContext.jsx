import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api/auth'
import { COOKIE_AUTH, TOKEN_KEY, onUnauthorized, setAuthToken, setSessionActive } from '../api/client'

const AuthContext = createContext(null)

const COOKIE_REJECTED =
  "You signed in, but the browser didn't keep the session cookie. " +
  'The backend must list this site (host:port) in SANCTUM_STATEFUL_DOMAINS.'

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

const writeToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage blocked (private mode) — session lives in memory only */
  }
}

export function AuthProvider({ children }) {
  // Cookie mode never keeps a token in JS (the HttpOnly cookie is the session).
  const [token, setToken] = useState(() => (COOKIE_AUTH ? null : readToken()))
  const [user, setUser] = useState(null)
  // Token mode: verify a stored token, else guest. Cookie mode: JS can't see the
  // HttpOnly cookie, so always ask /auth/me before deciding.
  const [status, setStatus] = useState(() => (COOKIE_AUTH || readToken() ? 'loading' : 'guest'))

  const clearSession = useCallback(() => {
    setAuthToken(null)
    setSessionActive(false)
    writeToken(null)
    setToken(null)
    setUser(null)
    setStatus('guest')
  }, [])

  const startSession = useCallback(async ({ user: nextUser, token: nextToken }) => {
    if (COOKIE_AUTH) {
      // The session cookie was set by the login response. Confirm the browser kept it
      // (fails when the backend doesn't treat this origin as stateful).
      const profile = await authApi.me().catch(() => {
        throw new Error(COOKIE_REJECTED)
      })
      setSessionActive(true)
      setUser(profile ?? nextUser)
      setStatus('authenticated')
      return
    }

    if (!nextToken) throw new Error('The server did not return an access token.')
    setAuthToken(nextToken)
    // Some backends return only the token; fetch the profile in that case.
    const profile = nextUser ?? (await authApi.me().catch(() => null))
    setSessionActive(true)
    writeToken(nextToken)
    setToken(nextToken)
    setUser(profile)
    setStatus('authenticated')
  }, [])

  // Restore the session on first load.
  useEffect(() => {
    const stored = COOKIE_AUTH ? null : readToken()
    if (COOKIE_AUTH) writeToken(null) // drop any token left from token mode
    else if (!stored) return
    let cancelled = false
    setAuthToken(stored)
    authApi
      .me()
      .then((me) => {
        if (cancelled) return
        setSessionActive(true)
        setUser(me)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!cancelled) clearSession()
      })
    return () => {
      cancelled = true
    }
  }, [clearSession])

  // Any 401 on an authenticated request ends the session.
  useEffect(() => onUnauthorized(clearSession), [clearSession])

  const login = useCallback(async (credentials) => startSession(await authApi.login(credentials)), [startSession])

  const register = useCallback(async (input) => startSession(await authApi.register(input)), [startSession])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      /* token may already be invalid — clear locally regardless */
    }
    clearSession()
  }, [clearSession])

  /** Re-fetch the profile (e.g. after editing your own roles). */
  const refreshUser = useCallback(async () => {
    const me = await authApi.me()
    setUser(me)
    return me
  }, [])

  const value = useMemo(
    () => ({ user, token, status, login, register, logout, refreshUser }),
    [user, token, status, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
