import { describe, it, expect } from 'vitest'
import { validateUser, validateRole } from './validateAccess'

const user = { name: 'Ana', email: 'ana@team.dev', password: 'secret123', password_confirmation: 'secret123', role_id: '1' }

describe('validateUser', () => {
  it('accepts a valid new user', () => {
    expect(validateUser(user, { isNew: true })).toEqual({})
  })

  it('requires a password for new users only', () => {
    const noPw = { ...user, password: '', password_confirmation: '' }
    expect(validateUser(noPw, { isNew: true }).password).toBeTruthy()
    expect(validateUser(noPw, { isNew: false })).toEqual({})
  })

  it('checks email, length and confirmation', () => {
    const e = validateUser({ ...user, email: 'nope', password: 'short', password_confirmation: 'x' }, { isNew: true })
    expect(e.email).toBeTruthy()
    expect(e.password).toMatch(/8/)
  })

  it('rejects a mismatched confirmation when editing with a new password', () => {
    expect(validateUser({ ...user, password_confirmation: 'other123' }, { isNew: false }).password_confirmation).toBeTruthy()
  })
})

describe('validateUser role', () => {
  it('requires a role (backend: role_id is required)', () => {
    expect(validateUser({ ...user, role_id: '' }, { isNew: true }).role_id).toBe('Choose a role.')
    expect(validateUser({ ...user, role_id: null }, { isNew: false }).role_id).toBeTruthy()
  })
})

describe('validateRole', () => {
  it('requires a name', () => {
    expect(validateRole({ name: ' ' }).name).toBeTruthy()
    expect(validateRole({ name: 'editor' })).toEqual({})
  })
})
