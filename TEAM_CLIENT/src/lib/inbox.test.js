import { describe, it, expect } from 'vitest'
import { inboxReducer, initialInbox, INBOX_LIMIT } from './inbox'

const n = (id, read = false) => ({ id: String(id), title: `N${id}`, message: null, taskId: null, read, createdAt: 0 })

describe('inboxReducer', () => {
  it('takes the REST count and list', () => {
    const s = inboxReducer(initialInbox, { type: 'loaded', count: 5, items: [n(1), n(2, true)] })
    expect(s.count).toBe(5)
    expect(s.items.map((x) => x.id)).toEqual(['1', '2'])
  })

  it('falls back to counting unread items when the count request failed', () => {
    const s = inboxReducer(initialInbox, { type: 'loaded', count: null, items: [n(1), n(2), n(3, true)] })
    expect(s.count).toBe(2)
  })

  it('keeps the previous count when nothing usable came back', () => {
    const s = inboxReducer({ count: 4, items: [] }, { type: 'loaded', count: null, items: null })
    expect(s.count).toBe(4)
  })

  it('uses unreadCount from a live notification when present', () => {
    const s = inboxReducer({ count: 2, items: [] }, { type: 'received', notification: n(9), count: 7 })
    expect(s.count).toBe(7)
    expect(s.items[0].id).toBe('9')
  })

  it('estimates +1 for a live notification without a count, also before the first load', () => {
    expect(inboxReducer({ count: 2, items: [] }, { type: 'received', notification: n(9) }).count).toBe(3)
    expect(inboxReducer(initialInbox, { type: 'received', notification: n(9) }).count).toBe(1)
  })

  it('ignores a duplicate notification', () => {
    const s0 = { count: 1, items: [n(9)] }
    const s = inboxReducer(s0, { type: 'received', notification: n(9) })
    expect(s.count).toBe(1)
    expect(s.items).toHaveLength(1)
  })

  it('caps the list', () => {
    let s = initialInbox
    for (let i = 0; i < INBOX_LIMIT + 5; i += 1) s = inboxReducer(s, { type: 'received', notification: n(i) })
    expect(s.items).toHaveLength(INBOX_LIMIT)
    expect(s.count).toBe(INBOX_LIMIT + 5) // the count isn't limited by what we keep in memory
  })

  it('applies notification:count as is', () => {
    expect(inboxReducer({ count: 5, items: [] }, { type: 'count', count: 0 }).count).toBe(0)
  })

  it('marks one / all read', () => {
    const s0 = { count: 2, items: [n(1), n(2)] }
    const one = inboxReducer(s0, { type: 'read', id: '1' })
    expect(one.count).toBe(1)
    expect(one.items.find((x) => x.id === '1').read).toBe(true)
    expect(inboxReducer(one, { type: 'read', id: '1' })).toBe(one) // already read: no double decrement
    const all = inboxReducer(s0, { type: 'readAll' })
    expect(all.count).toBe(0)
    expect(all.items.every((x) => x.read)).toBe(true)
  })

  it('resets on sign-out', () => {
    expect(inboxReducer({ count: 3, items: [n(1)] }, { type: 'reset' })).toBe(initialInbox)
  })
})
