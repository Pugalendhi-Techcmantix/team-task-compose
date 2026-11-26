import { useState } from 'react'
import { NavLink } from 'react-router'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../socket/SocketContext'
import { initials } from '../../lib/format'
import NotificationBell from '../notifications/NotificationBell'
import { Brand } from './AuthLayout'

const CONNECTION = {
  live: { label: 'Live', dot: 'bg-signal', ring: 'animate-ping bg-signal/60' },
  connecting: { label: 'Reconnecting', dot: 'bg-ink-faint', ring: '' },
  offline: { label: 'Offline', dot: 'bg-danger', ring: '' },
}

const NAV = [
  { to: '/', label: 'Tasks', end: true },
  { to: '/chat', label: 'Chat' },
  { to: '/users', label: 'Users' },
  { to: '/roles', label: 'Roles' },
]

function NavItems({ items, navId }) {
  return items.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `relative isolate shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          isActive ? 'text-white' : 'text-ink-soft hover:bg-line-soft hover:text-ink'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`active-nav-${navId}`}
              className="absolute inset-0 -z-10 rounded-lg bg-ink"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            />
          )}
          <span className="relative">{item.label}</span>
        </>
      )}
    </NavLink>
  ))
}

export default function AppHeader() {
  const { user, logout } = useAuth()
  const { state: connection } = useSocket()
  const [signingOut, setSigningOut] = useState(false)
  const c = CONNECTION[connection] ?? CONNECTION.offline

  const onLogout = async () => {
    setSigningOut(true)
    await logout()
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <Brand />

        <span
          className="ml-1 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft"
          title={connection === 'live' ? 'Real-time updates are on' : 'Real-time updates paused; changes appear after reconnecting'}
        >
          <span className="relative flex size-2">
            {c.ring && <span className={`absolute inline-flex size-full rounded-full ${c.ring}`} />}
            <span className={`relative inline-flex size-2 rounded-full ${c.dot}`} />
          </span>
          {c.label}
        </span>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
          <NavItems items={NAV} navId="desktop" />
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <NotificationBell />
          <div className="hidden text-right sm:block">
            <p className="max-w-40 truncate text-sm leading-tight font-semibold">{user?.name}</p>
            <p className="max-w-40 truncate text-xs leading-tight text-ink-faint">{user?.email}</p>
          </div>
          <span className="hidden size-9 place-items-center rounded-full bg-ink text-xs font-bold text-white sm:grid" aria-hidden="true">
            {initials(user?.name)}
          </span>
          <button
            type="button"
            onClick={onLogout}
            disabled={signingOut}
            className="ml-1 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap text-ink-soft hover:bg-line-soft hover:text-ink disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      </div>

      {NAV.length > 1 && (
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 pb-2.5 sm:px-6 lg:hidden" aria-label="Main">
          <NavItems items={NAV} navId="mobile" />
        </nav>
      )}
    </header>
  )
}
