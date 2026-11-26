import { useCallback, useEffect, useRef, useState } from 'react'
import { useSocket } from './SocketContext'
import { SOCKET_EVENTS } from './socket'
import { MAX_MESSAGE_LENGTH, RealtimeError, ackErrorCode, realtimeErrorMessage } from './realtimeErrors'

const ACK_TIMEOUT_MS = 10_000
const TYPING_IDLE_MS = 3000

const sameId = (a, b) => String(a) === String(b)

/** emitWithAck with a timeout; a timeout becomes { ok: false, code: 'TIMEOUT' }. */
const ask = (socket, event, payload) =>
  socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload).catch(() => ({ ok: false, code: 'TIMEOUT' }))

/**
 * Live side of one chat conversation (history comes from Laravel's REST API).
 *
 * - Joins on connect and re-joins after every reconnect.
 * - `messages` holds only messages that arrived over the socket (including your own):
 *   a sent message appears when `chat:message` arrives, never from the chat:send reply.
 * - `send(text)` resolves with the saved message or throws a RealtimeError.
 * - `typing()` on each keystroke; `stopTyping()` on send/blur (also automatic after 3 s idle).
 */
export function useConversation(conversationId) {
  const { socket, state } = useSocket()
  const [joinState, setJoinState] = useState('idle') // idle | joining | joined | denied | error
  const [joinError, setJoinError] = useState(null)
  const [messages, setMessages] = useState([])
  const [typingUserIds, setTypingUserIds] = useState([])
  const [lastError, setLastError] = useState(null)
  const typingRef = useRef({ active: false, timer: null })

  const join = useCallback(async () => {
    if (!socket || conversationId === null || conversationId === undefined) return false
    setJoinState('joining')
    const code = ackErrorCode(await ask(socket, SOCKET_EVENTS.JOIN, { conversationId }))
    if (!code) {
      setJoinState('joined')
      setJoinError(null)
      return true
    }
    setJoinState(code === 'CONVERSATION_ACCESS_DENIED' ? 'denied' : 'error')
    setJoinError(realtimeErrorMessage(code))
    return false
  }, [socket, conversationId])

  useEffect(() => {
    if (!socket || conversationId === null || conversationId === undefined) return undefined
    const typingState = typingRef.current
    const forThis = (p) => p && sameId(p.conversationId, conversationId)

    const onMessage = (m) => {
      if (!forThis(m)) return
      setMessages((list) => (list.some((x) => sameId(x.id, m.id)) ? list : [...list, m]))
      setTypingUserIds((ids) => ids.filter((id) => !sameId(id, m.senderId)))
    }
    const onTypingStart = (p) => {
      if (forThis(p)) setTypingUserIds((ids) => (ids.some((id) => sameId(id, p.userId)) ? ids : [...ids, p.userId]))
    }
    const onTypingStop = (p) => {
      if (forThis(p)) setTypingUserIds((ids) => ids.filter((id) => !sameId(id, p.userId)))
    }
    const onChatError = (e) => setLastError({ code: e?.code, message: realtimeErrorMessage(e?.code, e?.message), event: e?.event })
    const onConnect = () => join()

    socket.on(SOCKET_EVENTS.CHAT_MESSAGE, onMessage)
    socket.on(SOCKET_EVENTS.TYPING_START, onTypingStart)
    socket.on(SOCKET_EVENTS.TYPING_STOP, onTypingStop)
    socket.on(SOCKET_EVENTS.CHAT_ERROR, onChatError)
    socket.on('connect', onConnect) // re-join after every reconnect
    if (socket.connected) queueMicrotask(join) // already connected → join now (async, not during the effect)

    return () => {
      socket.off(SOCKET_EVENTS.CHAT_MESSAGE, onMessage)
      socket.off(SOCKET_EVENTS.TYPING_START, onTypingStart)
      socket.off(SOCKET_EVENTS.TYPING_STOP, onTypingStop)
      socket.off(SOCKET_EVENTS.CHAT_ERROR, onChatError)
      socket.off('connect', onConnect)
      clearTimeout(typingState.timer)
      typingState.active = false
      if (socket.connected) socket.emit(SOCKET_EVENTS.LEAVE, { conversationId }, () => {})
      setMessages([])
      setTypingUserIds([])
      setJoinState('idle')
    }
  }, [socket, conversationId, join])

  const stopTyping = useCallback(() => {
    const t = typingRef.current
    clearTimeout(t.timer)
    if (t.active && socket?.connected) socket.emit(SOCKET_EVENTS.TYPING_STOP, { conversationId })
    t.active = false
  }, [socket, conversationId])

  /** Call on each keystroke: sends typing:start once, typing:stop after 3 s without typing. */
  const typing = useCallback(() => {
    if (!socket?.connected || joinState !== 'joined') return
    const t = typingRef.current
    if (!t.active) {
      socket.emit(SOCKET_EVENTS.TYPING_START, { conversationId })
      t.active = true
    }
    clearTimeout(t.timer)
    t.timer = setTimeout(stopTyping, TYPING_IDLE_MS)
  }, [socket, conversationId, joinState, stopTyping])

  const send = useCallback(
    async (text) => {
      const message = String(text ?? '').trim()
      if (!message) throw new RealtimeError('EMPTY', 'Type a message first.')
      if (message.length > MAX_MESSAGE_LENGTH) throw new RealtimeError('MESSAGE_TOO_LARGE')
      if (!socket?.connected) throw new RealtimeError('OFFLINE', 'You are offline. Try again when reconnected.')
      stopTyping()

      let reply = await ask(socket, SOCKET_EVENTS.CHAT_SEND, { conversationId, message })
      if (ackErrorCode(reply) === 'NOT_IN_CONVERSATION' && (await join())) {
        reply = await ask(socket, SOCKET_EVENTS.CHAT_SEND, { conversationId, message }) // rejoin, then retry once
      }
      const code = ackErrorCode(reply)
      if (code) throw new RealtimeError(code, reply?.error?.message ?? reply?.message)
      return reply.data ?? null
    },
    [socket, conversationId, join, stopTyping],
  )

  return { connection: state, joinState, joinError, messages, typingUserIds, lastError, send, typing, stopTyping, rejoin: join }
}
