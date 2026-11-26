import { useEffect, useRef, useState } from 'react'
import { useNotifications } from '../../context/NotificationContext'
import { formatAgo } from '../../lib/format'

export default function NotificationBell() {
  const { history, unread, markAllRead, clearHistory } = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open && unread) markAllRead()
    setOpen((o) => !o)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid size-10 place-items-center rounded-lg text-ink-soft hover:bg-line-soft hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-signal px-1 text-[10px] leading-4 font-bold text-ink">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <h2 className="text-sm font-bold">Live activity</h2>
            {history.length > 0 && (
              <button type="button" onClick={clearHistory} className="text-xs font-medium text-ink-faint hover:text-ink">
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">
              Changes from your team will show up here as they happen.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto">
              {history.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{n.message}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{formatAgo(n.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
