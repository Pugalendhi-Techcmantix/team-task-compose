import { describe, it, expect } from 'vitest'
import { tasksReducer, initialTasksState } from './tasksReducer'

const t = (id, extra = {}) => ({ id, title: `Task ${id}`, status: 'todo', ...extra })

describe('tasksReducer', () => {
  it('loading sets status and clears error', () => {
    const s = tasksReducer({ ...initialTasksState, error: 'x' }, { type: 'loading' })
    expect(s.status).toBe('loading')
    expect(s.error).toBeNull()
  })

  it('loaded replaces items', () => {
    const s = tasksReducer(initialTasksState, { type: 'loaded', tasks: [t(1), t(2)] })
    expect(s.items).toHaveLength(2)
    expect(s.status).toBe('ready')
  })

  it('upsert of an existing id replaces it without duplicating', () => {
    const start = tasksReducer(initialTasksState, { type: 'loaded', tasks: [t(1), t(2)] })
    const s = tasksReducer(start, { type: 'upsert', task: t(2, { title: 'Changed' }) })
    expect(s.items).toHaveLength(2)
    expect(s.items.find((x) => x.id === 2).title).toBe('Changed')
  })

  it('upsert treats "2" and 2 as the same id (socket payloads may stringify)', () => {
    const start = tasksReducer(initialTasksState, { type: 'loaded', tasks: [t(2)] })
    const s = tasksReducer(start, { type: 'upsert', task: t('2', { title: 'Echo' }) })
    expect(s.items).toHaveLength(1)
  })

  it('upsert of a new id prepends', () => {
    const start = tasksReducer(initialTasksState, { type: 'loaded', tasks: [t(1)] })
    const s = tasksReducer(start, { type: 'upsert', task: t(9) })
    expect(s.items.map((x) => x.id)).toEqual([9, 1])
  })

  it('remove drops by id with string/number ids', () => {
    const start = tasksReducer(initialTasksState, { type: 'loaded', tasks: [t(1), t(2)] })
    const s = tasksReducer(start, { type: 'remove', id: '1' })
    expect(s.items.map((x) => x.id)).toEqual([2])
  })

  it('ignores malformed upserts', () => {
    const start = tasksReducer(initialTasksState, { type: 'loaded', tasks: [t(1)] })
    expect(tasksReducer(start, { type: 'upsert', task: null })).toBe(start)
    expect(tasksReducer(start, { type: 'upsert', task: { title: 'no id' } })).toBe(start)
  })

  it('failed stores the error', () => {
    const s = tasksReducer(initialTasksState, { type: 'failed', error: 'Down' })
    expect(s.status).toBe('error')
    expect(s.error).toBe('Down')
  })
})
