import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

/** Minimal stand-in for a connected socket.io-client Socket. */
function fakeSocket(replies = {}) {
  const handlers = new Map()
  const sent = []
  const socket = {
    connected: true,
    sent,
    on: (e, fn) => handlers.set(e, [...(handlers.get(e) ?? []), fn]),
    off: (e, fn) => handlers.set(e, (handlers.get(e) ?? []).filter((h) => h !== fn)),
    emit: (e, payload) => sent.push([e, payload]),
    timeout: () => ({
      emitWithAck: async (e, payload) => {
        sent.push([e, payload])
        const r = replies[e]
        return typeof r === 'function' ? r(payload) : (r ?? { ok: true })
      },
    }),
    serverEmit: (e, payload) => (handlers.get(e) ?? []).forEach((fn) => fn(payload)),
  }
  return socket
}

let current
vi.mock('./SocketContext', () => ({ useSocket: () => ({ socket: current, state: 'live' }) }))
const { useConversation } = await import('./useConversation')

const msg = (id, extra = {}) => ({ id, conversationId: 1, senderId: 7, message: `m${id}`, createdAt: 'now', ...extra })

describe('useConversation', () => {
  beforeEach(() => {
    current = fakeSocket()
  })

  it('joins the conversation when connected', async () => {
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    expect(current.sent).toContainEqual(['conversation:join', { conversationId: 1 }])
  })

  it('shows access denied', async () => {
    current = fakeSocket({ 'conversation:join': { ok: false, error: { code: 'CONVERSATION_ACCESS_DENIED' } } })
    const { result } = renderHook(() => useConversation(2))
    await waitFor(() => expect(result.current.joinState).toBe('denied'))
    expect(result.current.joinError).toBe("You're not a member of this conversation")
  })

  it('re-joins after every reconnect', async () => {
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    await act(async () => current.serverEmit('connect'))
    expect(current.sent.filter(([e]) => e === 'conversation:join')).toHaveLength(2)
  })

  it('adds messages only from chat:message, once, for this conversation', async () => {
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    act(() => {
      current.serverEmit('chat:message', msg(1))
      current.serverEmit('chat:message', msg(1)) // duplicate
      current.serverEmit('chat:message', msg(2, { conversationId: 9 })) // other conversation
    })
    expect(result.current.messages.map((m) => m.id)).toEqual([1])
  })

  it('does not add the message from the chat:send reply', async () => {
    current = fakeSocket({ 'chat:send': ({ message }) => ({ ok: true, data: msg(5, { message }) }) })
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    let saved
    await act(async () => {
      saved = await result.current.send('  hello  ')
    })
    expect(saved.id).toBe(5)
    expect(current.sent).toContainEqual(['chat:send', { conversationId: 1, message: 'hello' }])
    expect(result.current.messages).toEqual([]) // waits for chat:message
  })

  it('rejoins and retries once on NOT_IN_CONVERSATION', async () => {
    let first = true
    current = fakeSocket({
      'chat:send': () => (first ? ((first = false), { ok: false, code: 'NOT_IN_CONVERSATION' }) : { ok: true, data: msg(6) }),
    })
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    await act(async () => {
      await result.current.send('hi')
    })
    const events = current.sent.map(([e]) => e)
    expect(events.filter((e) => e === 'chat:send')).toHaveLength(2)
    expect(events.filter((e) => e === 'conversation:join')).toHaveLength(2)
  })

  it('rejects long messages before sending and maps server errors', async () => {
    current = fakeSocket({ 'chat:send': { ok: false, code: 'RATE_LIMITED' } })
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    await expect(result.current.send('x'.repeat(2001))).rejects.toMatchObject({ code: 'MESSAGE_TOO_LARGE' })
    await expect(result.current.send('hi')).rejects.toMatchObject({ code: 'RATE_LIMITED', message: 'Slow down' })
  })

  it('tracks who is typing and never sends userId', async () => {
    const { result } = renderHook(() => useConversation(1))
    await waitFor(() => expect(result.current.joinState).toBe('joined'))
    act(() => current.serverEmit('typing:start', { conversationId: 1, userId: 3 }))
    expect(result.current.typingUserIds).toEqual([3])
    act(() => current.serverEmit('typing:stop', { conversationId: 1, userId: 3 }))
    expect(result.current.typingUserIds).toEqual([])

    act(() => {
      result.current.typing()
      result.current.typing()
    })
    const starts = current.sent.filter(([e]) => e === 'typing:start')
    expect(starts).toEqual([['typing:start', { conversationId: 1 }]])
  })
})
