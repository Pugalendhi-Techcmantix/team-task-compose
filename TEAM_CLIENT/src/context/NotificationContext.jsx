import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const NotificationContext = createContext(null)

const TOAST_MS = 5000
let nextId = 1

/**
 * Toasts only. The bell's unread count and list are server-backed
 * (see src/socket/NotificationInbox.jsx).
 */
export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  /** Show a toast. tone: 'info' | 'success' | 'error' | 'live'. */
  const notify = useCallback(
    (message, { tone = 'info' } = {}) => {
      const id = nextId++
      setToasts((list) => [...list.slice(-3), { id, message, tone }])
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS))
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => map.forEach(clearTimeout)
  }, [])

  const value = useMemo(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss])

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>')
  return ctx
}
