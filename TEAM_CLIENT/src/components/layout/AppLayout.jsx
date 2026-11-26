import { Outlet } from 'react-router'
import AppHeader from './AppHeader'

/** Shell for signed-in pages: sticky header + nav, page content below. */
export default function AppLayout() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <Outlet />
    </div>
  )
}

/** Standard page width/padding. The task dashboard opts into a wider command-deck canvas. */
export function Page({ children, wide = false, className = '' }) {
  return (
    <main
      className={`mx-auto w-full px-4 pt-8 pb-24 sm:px-6 sm:pt-10 ${wide ? 'max-w-[1600px]' : 'max-w-5xl'} ${className}`}
    >
      {children}
    </main>
  )
}
