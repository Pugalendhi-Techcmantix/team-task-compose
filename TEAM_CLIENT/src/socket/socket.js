import { io } from 'socket.io-client'
import { env } from '../config/env'

/** Event names agreed with the Node.js real-time service (PLAN.md §3 Real-time). */
export const SOCKET_EVENTS = Object.freeze({
  // server → client
  NOTIFICATION: 'notification', // { id, type, title, message, taskId, createdAt, unreadCount? }
  NOTIFICATION_COUNT: 'notification:count', // { unreadCount, updatedAt } (Laravel's count, all tabs)
  CHAT_MESSAGE: 'chat:message', // { id, conversationId, senderId, message, createdAt }
  TYPING_START: 'typing:start', // { conversationId, userId }
  TYPING_STOP: 'typing:stop',
  PRESENCE: 'presence:update', // { userId, status: 'online' | 'offline', at }
  CHAT_ERROR: 'chat:error', // { code, message, event }
  // client → server (always with an acknowledgement)
  JOIN: 'conversation:join', // { conversationId } → { ok: true } | error
  LEAVE: 'conversation:leave', // { conversationId } → { ok: true }
  CHAT_SEND: 'chat:send', // { conversationId, message } → { ok: true, data: message }
})

/** Handshake rejections that mean "get a new token and try again". */
export const AUTH_ERROR_CODES = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHORIZED'])

/** Code from a connect_error (server sends { data: { code, message } }). */
export const connectErrorCode = (err) => err?.data?.code ?? null

/**
 * Create the Socket.IO client. Caller owns connect()/disconnect().
 * `getToken()` runs on every (re)connect (auth function form), so each handshake
 * carries a fresh realtime token and nothing is stored.
 */
export function createSocket(getToken) {
  const options = {
    path: env.socketPath,
    autoConnect: false,
    auth: (cb) => {
      getToken().then(
        (token) => cb({ token }),
        () => cb({}), // server answers UNAUTHORIZED → SocketProvider decides what to do
      )
    },
    withCredentials: true, // only matters when VITE_SOCKET_URL is another origin
    transports: ['websocket', 'polling'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  }
  // No URL → same origin (Nginx / Vite proxy forwards /socket.io)
  return env.socketUrl ? io(env.socketUrl, options) : io(options)
}

/**
 * What to do after the server rejected our token.
 * Retry with a fresh token (backing off), and give up after `max` tries in a row:
 * then the user must sign in again (per the Node.js contract).
 */
export function authRetryPlan(failures, max = 3) {
  if (failures > max) return { action: 'logout' }
  return { action: 'retry', delayMs: 1000 * 2 ** (failures - 1) }
}
