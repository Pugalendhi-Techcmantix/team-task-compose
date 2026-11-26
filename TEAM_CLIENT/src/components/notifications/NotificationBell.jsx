import { useEffect, useRef, useState } from 'react'
import { useInbox } from '../../socket/NotificationInbox'
import { notificationText } from '../../socket/notificationText'
import { formatAgo } from '../../lib/format'

export default function NotificationBell() {
  const { items, unreadCount, markAllRead } = useInbox()
  const [open, setOpen] = useState(false)
  // Ids that were unread when the panel opened, so they keep their dot while it's open.
  const [freshIds, setFreshIds] = useState(() => new Set())
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
    if (!open) {
      setFreshIds(new Set(items.filter((n) => !n.read).map((n) => n.id)))
      if (unreadCount > 0) markAllRead()
    }
    setOpen((o) => !o)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative grid size-10 place-items-center rounded-lg text-ink-soft hover:bg-line-soft hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-signal px-1 text-[10px] leading-4 font-bold text-ink">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="border-b border-line-soft px-4 py-3">
            <h2 className="text-sm font-bold">Notifications</h2>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-faint">
              Changes from your team will show up here as they happen.
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-3">
                  <span
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${freshIds.has(n.id) ? 'bg-signal' : 'bg-line'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{notificationText(n) || 'Notification'}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">{formatAgo(n.createdAt)}</p>
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
