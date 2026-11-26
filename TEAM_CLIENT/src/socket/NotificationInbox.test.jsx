import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationInboxProvider } from './NotificationInbox'
import NotificationBell from '../components/notifications/NotificationBell'
import { notificationsApi } from '../api/notifications'

/** Minimal Socket.IO stand-in: on/off/emit. */
function fakeSocket() {
  const handlers = new Map()
  return {
    connected: true,
    on(event, fn) {
      handlers.set(event, [...(handlers.get(event) ?? []), fn])
    },
    off(event, fn) {
      handlers.set(event, (handlers.get(event) ?? []).filter((f) => f !== fn))
    },
    serverEmit(event, payload) {
      ;(handlers.get(event) ?? []).forEach((fn) => fn(payload))
    },
  }
}

let socket
vi.mock('./SocketContext', () => ({ useSocket: () => ({ socket, state: 'live' }) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ status: 'authenticated' }) }))
vi.mock('../api/notifications', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    notificationsApi: { unreadCount: vi.fn(), list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
  }
})

const renderBell = () =>
  render(
    <NotificationInboxProvider>
      <NotificationBell />
    </NotificationInboxProvider>,
  )

const badge = () => screen.getByRole('button', { name: /notifications/i })

describe('NotificationInboxProvider + NotificationBell', () => {
  beforeEach(() => {
    socket = fakeSocket()
    notificationsApi.unreadCount.mockReset().mockResolvedValue(3)
    notificationsApi.list.mockReset().mockResolvedValue([])
    notificationsApi.markAllRead.mockReset().mockResolvedValue(null)
    notificationsApi.markRead.mockReset().mockResolvedValue(null)
  })

  it('shows the unread count from Laravel on load', async () => {
    renderBell()
    await waitFor(() => expect(badge()).toHaveAccessibleName('Notifications, 3 unread'))
  })

  it('follows notification:count and the unreadCount on new notifications', async () => {
    renderBell()
    await waitFor(() => expect(badge()).toHaveAccessibleName('Notifications, 3 unread'))

    act(() => socket.serverEmit('notification', { id: 'n1', title: 'New task assigned', message: 'Fix login', taskId: 1, createdAt: new Date().toISOString(), unreadCount: 4 }))
    expect(badge()).toHaveAccessibleName('Notifications, 4 unread')

    act(() => socket.serverEmit('notification', { id: 'n2', title: 'Task updated', taskId: 2, createdAt: new Date().toISOString() }))
    expect(badge()).toHaveAccessibleName('Notifications, 5 unread') // no count in payload → +1

    act(() => socket.serverEmit('notification:count', { unreadCount: 0, updatedAt: new Date().toISOString() }))
    expect(badge()).toHaveAccessibleName('Notifications')
  })

  it('opening the bell marks all read on the server and lists notifications', async () => {
    renderBell()
    await waitFor(() => expect(badge()).toHaveAccessibleName('Notifications, 3 unread'))
    act(() => socket.serverEmit('notification', { id: 'n1', title: 'New task assigned', message: 'Fix login', createdAt: new Date().toISOString() }))

    await userEvent.click(badge())
    expect(notificationsApi.markAllRead).toHaveBeenCalledTimes(1)
    expect(badge()).toHaveAccessibleName('Notifications')
    expect(screen.getByText('New task assigned: Fix login')).toBeInTheDocument()
  })

  it('reloads from Laravel after a reconnect', async () => {
    renderBell()
    await waitFor(() => expect(notificationsApi.unreadCount).toHaveBeenCalledTimes(1))
    notificationsApi.unreadCount.mockResolvedValue(9)
    act(() => socket.serverEmit('connect'))
    await waitFor(() => expect(badge()).toHaveAccessibleName('Notifications, 9 unread'))
  })
})
