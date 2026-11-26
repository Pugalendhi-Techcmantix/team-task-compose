import { describe, it, expect, afterEach } from 'vitest'
import { authRetryPlan, connectErrorCode, AUTH_ERROR_CODES } from './socket'
import { ackErrorCode, realtimeErrorMessage, RealtimeError } from './realtimeErrors'
import { notificationText } from './notificationText'
import { isOwnTask, markOwnTask } from './ownChanges'
import { api } from '../api/client'
import { fetchRealtimeToken } from '../api/realtime'

describe('socket auth handling', () => {
  it('reads the code the Node server puts in connect_error.data', () => {
    // verified against the dev server: { message, data: { code: 'INVALID_TOKEN', message } }
    expect(connectErrorCode({ message: 'Invalid authentication token', data: { code: 'INVALID_TOKEN' } })).toBe('INVALID_TOKEN')
    expect(connectErrorCode(new Error('xhr poll error'))).toBeNull()
    expect([...AUTH_ERROR_CODES].sort()).toEqual(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'UNAUTHORIZED'])
  })

  it('retries with a fresh token, backing off, then sends the user to sign in', () => {
    expect(authRetryPlan(1)).toEqual({ action: 'retry', delayMs: 1000 })
    expect(authRetryPlan(2)).toEqual({ action: 'retry', delayMs: 2000 })
    expect(authRetryPlan(3)).toEqual({ action: 'retry', delayMs: 4000 })
    expect(authRetryPlan(4)).toEqual({ action: 'logout' })
  })
})

describe('acknowledgements and error codes', () => {
  it('detects success and the different error reply shapes', () => {
    expect(ackErrorCode({ ok: true })).toBeNull()
    expect(ackErrorCode({ ok: true, data: { id: 1 } })).toBeNull()
    expect(ackErrorCode({ ok: false, code: 'RATE_LIMITED' })).toBe('RATE_LIMITED')
    expect(ackErrorCode({ ok: false, error: { code: 'CONVERSATION_ACCESS_DENIED' } })).toBe('CONVERSATION_ACCESS_DENIED')
    expect(ackErrorCode('CONVERSATION_ACCESS_DENIED')).toBe('CONVERSATION_ACCESS_DENIED')
    expect(ackErrorCode(undefined)).toBe('UNKNOWN')
  })

  it('shows the agreed text per code', () => {
    expect(realtimeErrorMessage('CONVERSATION_ACCESS_DENIED')).toBe("You're not a member of this conversation")
    expect(realtimeErrorMessage('MESSAGE_TOO_LARGE')).toBe('Message too long (max 2000)')
    expect(realtimeErrorMessage('RATE_LIMITED')).toBe('Slow down')
    expect(realtimeErrorMessage('MESSAGE_PERSISTENCE_FAILED')).toBe('Not sent, try again')
    expect(new RealtimeError('NOPE', 'Server said no').message).toBe('Server said no')
  })
})

describe('notifications', () => {
  it('formats title and message', () => {
    expect(notificationText({ title: 'Task assigned', message: 'Fix login' })).toBe('Task assigned: Fix login')
    expect(notificationText({ title: 'Task assigned' })).toBe('Task assigned')
    expect(notificationText({ message: 'Fix login' })).toBe('Fix login')
    expect(notificationText(null)).toBe('')
  })

  it('remembers tasks this tab just changed', () => {
    expect(isOwnTask(42)).toBe(false)
    markOwnTask(42)
    expect(isOwnTask('42')).toBe(true)
    expect(isOwnTask(null)).toBe(false)
  })
})

describe('fetchRealtimeToken', () => {
  const original = api.defaults.adapter
  afterEach(() => {
    api.defaults.adapter = original
  })

  it('POSTs /realtime/token and returns data.token', async () => {
    const calls = []
    api.defaults.adapter = async (config) => {
      calls.push(`${config.method} ${config.url}`)
      return { status: 200, data: { data: { token: 'rt-123', expires_at: '2026-11-26T10:00:00Z' } }, headers: {}, config }
    }
    await expect(fetchRealtimeToken()).resolves.toBe('rt-123')
    expect(calls).toEqual(['post /realtime/token'])
  })

  it('fails clearly when no token comes back', async () => {
    api.defaults.adapter = async (config) => ({ status: 200, data: { data: {} }, headers: {}, config })
    await expect(fetchRealtimeToken()).rejects.toThrow(/realtime token/)
  })
})
