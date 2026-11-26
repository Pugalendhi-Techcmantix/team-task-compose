import { describe, it, expect } from 'vitest'
import { api, unwrap, unwrapPage } from './client'

describe('api instance', () => {
  it('uses /api/v1 and always sends cookies + the XSRF header', () => {
    expect(api.defaults.baseURL).toBe('/api/v1')
    expect(api.defaults.withCredentials).toBe(true)
    expect(api.defaults.withXSRFToken).toBe(true)
  })
})

describe('unwrapPage', () => {
  it('reads a Laravel resource collection { data, links, meta }', () => {
    const res = { data: { data: [1, 2], links: {}, meta: { current_page: 2, last_page: 5, per_page: 2, total: 10 } } }
    expect(unwrapPage(res)).toEqual({ items: [1, 2], meta: { page: 2, lastPage: 5, perPage: 2, total: 10 } })
  })

  it('reads a plain paginator { current_page, data, last_page, ... }', () => {
    const res = { data: { current_page: 1, data: [1], last_page: 1, per_page: 15, total: 1 } }
    expect(unwrapPage(res).meta).toEqual({ page: 1, lastPage: 1, perPage: 15, total: 1 })
  })

  it('treats bare arrays and { data: [] } as a single page', () => {
    expect(unwrapPage({ data: [1, 2] })).toEqual({ items: [1, 2], meta: null })
    expect(unwrapPage({ data: { data: [3] } })).toEqual({ items: [3], meta: null })
  })
})

describe('unwrap', () => {
  it('unwraps a Laravel resource { data: X }', () => {
    expect(unwrap({ data: { data: [1, 2] } })).toEqual([1, 2])
  })

  it('returns a bare payload as-is', () => {
    expect(unwrap({ data: [1] })).toEqual([1])
    expect(unwrap({ data: { user: { id: 1 }, token: 't' } })).toEqual({ user: { id: 1 }, token: 't' })
  })

  it('handles empty 204 bodies', () => {
    expect(unwrap({ data: '' })).toBeNull()
    expect(unwrap({})).toBeNull()
  })
})
