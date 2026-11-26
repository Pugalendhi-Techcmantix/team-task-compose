import { describe, it, expect, afterEach } from 'vitest'
import { api } from './client'
import { tasksApi } from './tasks'

describe('tasksApi payload', () => {
  const original = api.defaults.adapter
  afterEach(() => {
    api.defaults.adapter = original
  })

  const capture = () => {
    const bodies = []
    api.defaults.adapter = async (config) => {
      bodies.push(JSON.parse(config.data))
      return { status: 200, data: { data: { id: 1 } }, headers: {}, config }
    }
    return bodies
  }

  const base = { title: ' T ', description: '', status: 'todo', priority: 'low', due_date: '' }

  it('sends assigned_to as a number, or null for unassigned', async () => {
    const bodies = capture()
    await tasksApi.create({ ...base, assigned_to: '9' })
    await tasksApi.update(1, { ...base, assigned_to: '' })
    expect(bodies[0]).toMatchObject({ title: 'T', assigned_to: 9 })
    expect(bodies[1].assigned_to).toBeNull()
  })

  it('leaves assigned_to out when the form did not include it', async () => {
    const bodies = capture()
    await tasksApi.update(1, base)
    expect('assigned_to' in bodies[0]).toBe(false)
  })
})
