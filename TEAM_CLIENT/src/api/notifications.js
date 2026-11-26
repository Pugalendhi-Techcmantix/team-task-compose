import { api, unwrap, unwrapPage } from './client'

/**
 * Laravel's stored notifications (routes confirmed on the dev backend):
 *   GET  /notifications                → list (newest first)
 *   GET  /notifications/unread-count   → the signed-in user's unread count
 *   POST /notifications/{uuid}/read    → mark one read
 *   POST /notifications/read-all       → mark all read
 * Response bodies aren't documented yet, so the readers below accept the usual
 * Laravel shapes (resource, bare object, database-notification row with `data`).
 */

const toCount = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

/** 3 · { unread_count: 3 } · { unreadCount: 3 } · { count: 3 } (each optionally inside { data }). */
export function readUnreadCount(body) {
  if (body === null || body === undefined) return null
  if (typeof body !== 'object') return toCount(body)
  for (const key of ['unread_count', 'unreadCount', 'count', 'unread']) {
    if (key in body) return toCount(body[key])
  }
  return 'data' in body ? readUnreadCount(body.data) : null
}

/**
 * One notification in the shape the UI uses:
 * { id, type, title, message, taskId, read, createdAt (ms) }.
 * Works for socket payloads ({ id, title, message, taskId, createdAt }) and
 * Laravel rows ({ id, type, data: { title, message, task_id }, read_at, created_at }).
 */
export function normalizeNotification(raw) {
  if (!raw || typeof raw !== 'object') return null
  const d = raw.data && typeof raw.data === 'object' ? raw.data : {}
  const id = raw.id ?? d.id
  if (id === undefined || id === null) return null
  const created = Date.parse(raw.createdAt ?? raw.created_at ?? d.createdAt ?? d.created_at ?? '')
  const readAt = raw.read_at ?? raw.readAt
  return {
    id: String(id),
    type: d.type ?? raw.type ?? null,
    title: raw.title ?? d.title ?? null,
    message: raw.message ?? d.message ?? d.body ?? null,
    taskId: raw.taskId ?? raw.task_id ?? d.taskId ?? d.task_id ?? null,
    read: typeof raw.read === 'boolean' ? raw.read : readAt !== undefined && readAt !== null,
    createdAt: Number.isNaN(created) ? Date.now() : created,
  }
}

export const notificationsApi = {
  /** @returns {Promise<number|null>} null when the reply has no recognisable count */
  async unreadCount() {
    return readUnreadCount((await api.get('/notifications/unread-count')).data)
  },

  /** Newest first. @returns {Promise<ReturnType<typeof normalizeNotification>[]>} */
  async list(params = {}) {
    const { items } = unwrapPage(await api.get('/notifications', { params }))
    return items.map(normalizeNotification).filter(Boolean)
  },

  async markRead(id) {
    return unwrap(await api.post(`/notifications/${encodeURIComponent(id)}/read`))
  },

  async markAllRead() {
    return unwrap(await api.post('/notifications/read-all'))
  },
}
