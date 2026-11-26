import { describe, it, expect } from 'vitest'
import { getErrorMessage, getFieldErrors } from './errors'

const axiosErr = (status, data) => ({ isAxiosError: true, response: { status, data } })

describe('getFieldErrors', () => {
  it('maps Laravel 422 errors to the first message per field', () => {
    const err = axiosErr(422, {
      message: 'The given data was invalid.',
      errors: { email: ['Email taken.', 'Other'], password: ['Too short.'] },
    })
    expect(getFieldErrors(err)).toEqual({ email: 'Email taken.', password: 'Too short.' })
  })

  it('maps the TaskFlow v1 shape { error: { details } }', () => {
    const err = axiosErr(422, {
      error: { code: 'validation_error', message: 'The given data was invalid.', details: { email: ['The email field is required.'] } },
    })
    expect(getFieldErrors(err)).toEqual({ email: 'The email field is required.' })
  })

  it('returns an empty object when there are no field errors', () => {
    expect(getFieldErrors(axiosErr(500, {}))).toEqual({})
    expect(getFieldErrors(new Error('x'))).toEqual({})
  })
})

describe('getErrorMessage', () => {
  it('uses the server message when present', () => {
    expect(getErrorMessage(axiosErr(422, { message: 'Invalid credentials.' }))).toBe(
      'Invalid credentials.',
    )
  })

  it('uses the TaskFlow v1 error.message', () => {
    const err = axiosErr(401, { error: { code: 'unauthenticated', message: 'Authentication is required.' } })
    expect(getErrorMessage(err)).toBe('Authentication is required.')
  })

  it('explains a network failure', () => {
    expect(getErrorMessage({ isAxiosError: true, request: {}, response: undefined })).toMatch(
      /cannot reach the server/i,
    )
  })

  it('falls back by status code', () => {
    expect(getErrorMessage(axiosErr(403, {}))).toMatch(/permission/i)
    expect(getErrorMessage(axiosErr(500, '<html>'))).toMatch(/server error/i)
  })

  it('handles plain errors', () => {
    expect(getErrorMessage(new Error('Boom'))).toBe('Boom')
  })
})
