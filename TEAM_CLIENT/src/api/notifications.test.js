import { describe, it, expect, afterEach } from 'vitest'
import { api } from './client'
import { normalizeNotification, notificationsApi, readUnreadCount } from './notifications'

describe('readUnreadCount', () => {
  it('accepts the usual Laravel shapes', () => {
    expect(readUnreadCount(3)).toBe(3)
    expect(readUnreadCount({ unread_count: 4 })).toBe(4)
    expect(readUnreadCount({ data: { unread_count: 5 } })).toBe(5)
    expect(readUnreadCount({ data: { unreadCount: 6 } })).toBe(6)
    expect(readUnreadCount({ count: '7' })).toBe(7)
    expect(readUnreadCount({ data: 8 })).toBe(8)
  })

  it('returns null for anything else', () => {
    expect(readUnreadCount(null)).toBeNull()
    expect(readUnreadCount({ message: 'ok' })).toBeNull()
    expect(readUnreadCount({ unread_count: -1 })).toBeNull()
    expect(readUnreadCount('abc')).toBeNull()
  })
})

describe('normalizeNotification', () => {
  it('reads a Laravel database-notification row', () => {
    expect(
      normalizeNotification({
        id: 'a1b2',
        type: 'App\\Notifications\\TaskAssigned',
        data: { type: 'task.assigned', title: 'New task assigned', message: 'Fix login', task_id: 12 },
        read_at: null,
        created_at: '2026-11-26T10:00:00Z',
      }),
    ).toEqual({
      id: 'a1b2',
      type: 'task.assigned',
      title: 'New task assigned',
      message: 'Fix login',
      taskId: 12,
      read: false,
      createdAt: Date.parse('2026-11-26T10:00:00Z'),
    })
  })

  it('reads the socket payload', () => {
    const x = normalizeNotification({ id: 5, type: 'task.updated', title: 'Task updated', message: 'Docs', taskId: 3, createdAt: '2026-11-26T10:00:00Z' })
    expect(x).toMatchObject({ id: '5', title: 'Task updated', taskId: 3, read: false })
  })

  it('treats read_at as read and drops rows without an id', () => {
    expect(normalizeNotification({ id: 1, read_at: '2026-11-26T10:00:00Z' }).read).toBe(true)
    expect(normalizeNotification({ title: 'no id' })).toBeNull()
  })
})

describe('notificationsApi', () => {
  const original = api.defaults.adapter
  afterEach(() => {
    api.defaults.adapter = original
  })

  it('calls the Laravel routes', async () => {
    const calls = []
    api.defaults.adapter = async (config) => {
      calls.push(`${config.method} ${config.url}`)
      const data = config.url === '/notifications/unread-count'
        ? { data: { unread_count: 2 } }
        : config.url === '/notifications'
          ? { data: [{ id: 'x', data: { title: 'T' }, read_at: null }], meta: { current_page: 1, last_page: 1, per_page: 15, total: 1 } }
          : { message: 'ok' }
      return { status: 200, data, headers: {}, config }
    }
    await expect(notificationsApi.unreadCount()).resolves.toBe(2)
    await expect(notificationsApi.list()).resolves.toMatchObject([{ id: 'x', title: 'T', read: false }])
    await notificationsApi.markRead('x')
    await notificationsApi.markAllRead()
    expect(calls).toEqual([
      'get /notifications/unread-count',
      'get /notifications',
      'post /notifications/x/read',
      'post /notifications/read-all',
    ])
  })
})
