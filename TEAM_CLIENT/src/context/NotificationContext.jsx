import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const NotificationContext = createContext(null)

const TOAST_MS = 5000
const HISTORY_LIMIT = 20
let nextId = 1

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [history, setHistory] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  /**
   * Show a toast. tone: 'info' | 'success' | 'error' | 'live'.
   * `record: true` also keeps it in the bell history (used for socket events).
   */
  const notify = useCallback(
    (message, { tone = 'info', record = false } = {}) => {
      const id = nextId++
      setToasts((list) => [...list.slice(-3), { id, message, tone }])
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_MS))
      if (record) {
        setHistory((h) => [{ id, message, tone, at: Date.now(), read: false }, ...h].slice(0, HISTORY_LIMIT))
      }
      return id
    },
    [dismiss],
  )

  const markAllRead = useCallback(() => setHistory((h) => h.map((n) => (n.read ? n : { ...n, read: true }))), [])
  const clearHistory = useCallback(() => setHistory([]), [])

  useEffect(() => {
    const map = timers.current
    return () => map.forEach(clearTimeout)
  }, [])

  const unread = history.filter((n) => !n.read).length

  const value = useMemo(
    () => ({ toasts, history, unread, notify, dismiss, markAllRead, clearHistory }),
    [toasts, history, unread, notify, dismiss, markAllRead, clearHistory],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>')
  return ctx
}
