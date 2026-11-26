import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import FullScreenLoader from '../components/ui/FullScreenLoader'

/** Login/register pages: signed-in users go back to where they came from. */
export default function GuestRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'authenticated') {
    const to = location.state?.from?.pathname || '/'
    return <Navigate to={to} replace />
  }
  return <Outlet />
}
