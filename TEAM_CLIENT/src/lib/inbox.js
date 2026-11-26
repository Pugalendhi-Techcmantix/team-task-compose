/**
 * Server-backed notification inbox (bell badge + list).
 * Laravel owns the unread count; we show its number whenever we have one and only
 * estimate (+1 per new notification) when a socket event arrives without a count.
 *
 * state: { count: number | null, items: Notification[] }   (count null = not loaded yet)
 */
export const INBOX_LIMIT = 30

export const initialInbox = { count: null, items: [] }

const unreadIn = (items) => items.filter((n) => !n.read).length

export function inboxReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialInbox

    // REST load. Either part may be missing (that request failed or had no usable data).
    case 'loaded': {
      const items = action.items ?? state.items
      const count = action.count ?? state.count ?? (action.items ? unreadIn(items) : null)
      return { count, items: items.slice(0, INBOX_LIMIT) }
    }

    // `notification:count` from Laravel via Node: authoritative.
    case 'count':
      return { ...state, count: action.count }

    // A live `notification`. Duplicates (same id) don't count twice.
    case 'received': {
      const n = action.notification
      if (!n) return state
      const seen = state.items.some((x) => x.id === n.id)
      const items = seen ? state.items : [n, ...state.items].slice(0, INBOX_LIMIT)
      const count = action.count ?? (seen || n.read ? state.count : (state.count ?? 0) + 1)
      return { count, items }
    }

    case 'readAll':
      return { count: 0, items: state.items.map((n) => (n.read ? n : { ...n, read: true })) }

    case 'read': {
      const target = state.items.find((n) => n.id === action.id)
      if (!target || target.read) return state
      return {
        count: state.count === null ? null : Math.max(0, state.count - 1),
        items: state.items.map((n) => (n.id === action.id ? { ...n, read: true } : n)),
      }
    }

    default:
      return state
  }
}
