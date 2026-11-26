import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { normalizeNotification, notificationsApi } from '../api/notifications'
import { inboxReducer, initialInbox } from '../lib/inbox'
import { SOCKET_EVENTS } from './socket'
import { useSocket } from './SocketContext'
import { useSocketEvent } from './useSocketEvent'

const InboxContext = createContext(null)

/**
 * Bell badge + list, backed by Laravel's stored notifications.
 * - Loads count and list from REST on sign-in and after every socket reconnect
 *   (events missed while offline are then counted too).
 * - `notification` (new one, may carry `unreadCount`) and `notification:count`
 *   (read elsewhere, other tab, delete) keep it live.
 * - Mark-as-read goes to Laravel, which then publishes the new count to every tab.
 * Must sit inside AuthProvider and SocketProvider.
 */
export function NotificationInboxProvider({ children }) {
  const { status } = useAuth()
  const { socket } = useSocket()
  const [state, dispatch] = useReducer(inboxReducer, initialInbox)
  // Bumped by every live count; a REST reply started before it is older and must not win.
  const liveVersion = useRef(0)

  const load = useCallback(async () => {
    const startedAt = liveVersion.current
    const [count, items] = await Promise.all([
      notificationsApi.unreadCount().catch(() => null),
      notificationsApi.list().catch(() => null),
    ])
    if (liveVersion.current !== startedAt) {
      if (items) dispatch({ type: 'loaded', items })
      return
    }
    dispatch({ type: 'loaded', count, items })
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      load()
      return undefined
    }
    dispatch({ type: 'reset' })
    return undefined
  }, [status, load])

  // Refetch after a reconnect (not on the first connect: the sign-in load covers that).
  useEffect(() => {
    if (!socket) return undefined
    let connectedBefore = socket.connected
    const onConnect = () => {
      if (connectedBefore) load()
      connectedBefore = true
    }
    socket.on('connect', onConnect)
    return () => socket.off('connect', onConnect)
  }, [socket, load])

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION, (payload) => {
    const notification = normalizeNotification(payload)
    if (!notification) return
    const count = Number.isInteger(payload?.unreadCount) ? payload.unreadCount : undefined
    if (count !== undefined) liveVersion.current += 1
    dispatch({ type: 'received', notification: { ...notification, read: false }, count })
  })

  useSocketEvent(SOCKET_EVENTS.NOTIFICATION_COUNT, (payload) => {
    if (!Number.isInteger(payload?.unreadCount) || payload.unreadCount < 0) return
    liveVersion.current += 1
    dispatch({ type: 'count', count: payload.unreadCount })
  })

  const markAllRead = useCallback(async () => {
    dispatch({ type: 'readAll' })
    try {
      await notificationsApi.markAllRead()
    } catch {
      load() // show the server's real state again
    }
  }, [load])

  const markRead = useCallback(
    async (id) => {
      dispatch({ type: 'read', id })
      try {
        await notificationsApi.markRead(id)
      } catch {
        load()
      }
    },
    [load],
  )

  const value = useMemo(
    () => ({ unreadCount: state.count ?? 0, items: state.items, markAllRead, markRead, reload: load }),
    [state, markAllRead, markRead, load],
  )

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

export function useInbox() {
  const ctx = useContext(InboxContext)
  if (!ctx) throw new Error('useInbox must be used inside <NotificationInboxProvider>')
  return ctx
}
