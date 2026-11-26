import { describe, it, expect } from 'vitest'
import { toUserPayload } from './access'

const base = { name: ' Kavya ', email: ' kavya@team.dev ', password: '', password_confirmation: '' }

describe('toUserPayload', () => {
  it('sends a single numeric role_id (backend: role_id is required)', () => {
    expect(toUserPayload({ ...base, role_id: '2' })).toEqual({ name: 'Kavya', email: 'kavya@team.dev', role_id: 2 })
  })

  it('sends role_id null when nothing is chosen, so the backend 422 lands on the field', () => {
    expect(toUserPayload({ ...base, role_id: '' }).role_id).toBeNull()
  })

  it('adds the password only when one is typed', () => {
    const body = toUserPayload({ ...base, role_id: 1, password: 'Qv7!marigold', password_confirmation: 'Qv7!marigold' })
    expect(body).toMatchObject({ password: 'Qv7!marigold', password_confirmation: 'Qv7!marigold' })
    expect(toUserPayload({ ...base, role_id: 1 })).not.toHaveProperty('password')
  })
})
