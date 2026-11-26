import { describe, it, expect } from 'vitest'
import { collectRoles, humanize, roleNames } from './roles'

const admin = { id: 1, name: 'Super Admin', slug: 'super_admin' }
const userRole = { id: 2, name: 'User', slug: 'user' }

describe('collectRoles', () => {
  it('builds unique filter options from the users list, sorted by name', () => {
    const users = [{ role_id: 2, role: userRole }, { role_id: 1, role: admin }, { role_id: 2, role: userRole }]
    expect(collectRoles([], users)).toEqual([{ id: 1, name: 'Super Admin' }, { id: 2, name: 'User' }])
  })

  it('keeps roles already seen when a filter narrows the list', () => {
    const known = [{ id: 1, name: 'Super Admin' }, { id: 2, name: 'User' }]
    expect(collectRoles(known, [{ role_id: 2, role: userRole }])).toBe(known)
  })

  it('ignores users without a role', () => {
    expect(collectRoles([], [{ role_id: null, role: null }, {}])).toEqual([])
  })
})

describe('roleNames', () => {
  it('normalises strings and objects', () => {
    expect(roleNames({ roles: ['a', { name: 'b' }] })).toEqual(['a', 'b'])
    expect(roleNames({})).toEqual([])
    expect(roleNames(null)).toEqual([])
  })

  it("reads the backend's single role object", () => {
    expect(roleNames({ role_id: 1, role: { id: 1, name: 'Super Admin', slug: 'super_admin' } })).toEqual(['Super Admin'])
  })
})

describe('humanize', () => {
  it('turns role slugs into labels', () => {
    expect(humanize('team-lead')).toBe('Team lead')
    expect(humanize('in_progress')).toBe('In progress')
    expect(humanize('')).toBe('')
  })
})
