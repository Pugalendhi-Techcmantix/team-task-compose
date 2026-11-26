import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchRealtimeToken } from '../api/realtime'
import { AUTH_ERROR_CODES, authRetryPlan, connectErrorCode, createSocket } from './socket'

const SocketContext = createContext({ socket: null, state: 'offline' })

/**
 * Holds one Socket.IO connection while the user is signed in.
 * state: 'offline' | 'connecting' | 'live'
 *
 * Auth (Node.js contract): every handshake fetches a fresh 15-minute token from
 * POST /api/v1/realtime/token. When the server rejects or drops us for the token
 * (TOKEN_EXPIRED / INVALID_TOKEN / UNAUTHORIZED, or an "io server disconnect"),
 * Socket.IO does NOT reconnect by itself, so we do, with a new token. After
 * repeated rejections the session is treated as over and the user signs in again.
 */
export function SocketProvider({ children }) {
  const { status, logout } = useAuth()
  const [conn, setConn] = useState({ socket: null, state: 'offline' })

  useEffect(() => {
    if (status !== 'authenticated') return undefined

    const socket = createSocket(fetchRealtimeToken)
    const set = (state) => setConn({ socket, state })
    let authFailures = 0
    let retryTimer = null

    const reconnectSoon = (delayMs) => {
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => socket.connect(), delayMs)
    }

    socket.on('connect', () => {
      authFailures = 0
      set('live')
    })

    socket.on('disconnect', (reason) => {
      set('connecting')
      // Server-side disconnect (e.g. token expired) → no automatic reconnect; do it ourselves.
      if (reason === 'io server disconnect') reconnectSoon(500)
    })

    socket.on('connect_error', (err) => {
      if (socket.active) {
        set('connecting') // network problem: Socket.IO keeps retrying on its own
        return
      }
      const code = connectErrorCode(err)
      if (!AUTH_ERROR_CODES.has(code)) {
        set('offline')
        return
      }
      authFailures += 1
      const plan = authRetryPlan(authFailures)
      if (plan.action === 'logout') {
        set('offline')
        logout()
        return
      }
      set('connecting')
      reconnectSoon(plan.delayMs)
    })

    socket.io.on('reconnect_attempt', () => set('connecting'))

    set('connecting')
    socket.connect()

    return () => {
      clearTimeout(retryTimer)
      socket.removeAllListeners()
      socket.io.removeAllListeners()
      socket.disconnect()
      setConn({ socket: null, state: 'offline' })
    }
  }, [status, logout])

  return <SocketContext.Provider value={conn}>{children}</SocketContext.Provider>
}

export const useSocket = () => useContext(SocketContext)
