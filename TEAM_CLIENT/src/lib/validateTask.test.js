import { describe, it, expect } from 'vitest'
import { validateTask } from './validateTask'

const valid = { title: 'Write docs', description: '', status: 'todo', priority: 'medium', due_date: '' }

describe('validateTask', () => {
  it('accepts a valid task', () => {
    expect(validateTask(valid)).toEqual({})
  })

  it('requires a title (whitespace only is empty)', () => {
    expect(validateTask({ ...valid, title: '   ' }).title).toMatch(/required/i)
  })

  it('limits title to 255 characters', () => {
    expect(validateTask({ ...valid, title: 'a'.repeat(256) }).title).toMatch(/255/)
  })

  it('rejects unknown status and priority', () => {
    const e = validateTask({ ...valid, status: 'completed', priority: 'urgent' })
    expect(e.status).toBeTruthy()
    expect(e.priority).toBeTruthy()
  })

  it('rejects a malformed due date', () => {
    expect(validateTask({ ...valid, due_date: '2026-13-45' }).due_date).toBeTruthy()
    expect(validateTask({ ...valid, due_date: '2026-12-01' })).toEqual({})
  })
})
