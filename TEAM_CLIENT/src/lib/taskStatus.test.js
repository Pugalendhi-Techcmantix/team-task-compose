import { describe, it, expect } from 'vitest'
import { STATUS_OPTIONS, countByStatus, isDone, statusLabel } from './taskStatus'

describe('task statuses', () => {
  it('are Todo, In Progress, Done in workflow order', () => {
    expect(STATUS_OPTIONS).toEqual([
      { value: 'todo', label: 'Todo' },
      { value: 'in_progress', label: 'In Progress' },
      { value: 'done', label: 'Done' },
    ])
  })

  it('labels known values and shows unknown ones as-is', () => {
    expect(statusLabel('in_progress')).toBe('In Progress')
    expect(statusLabel('pending')).toBe('pending')
  })

  it('counts tasks per status', () => {
    const tasks = [{ status: 'todo' }, { status: 'done' }, { status: 'done' }, { status: 'weird' }]
    expect(countByStatus(tasks)).toEqual({ all: 4, todo: 1, in_progress: 0, done: 2 })
  })

  it('knows when a task is done', () => {
    expect(isDone('done')).toBe(true)
    expect(isDone('in_progress')).toBe(false)
  })
})
