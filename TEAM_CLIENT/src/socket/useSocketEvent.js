import { useEffect, useRef } from 'react'
import { useSocket } from './SocketContext'

/**
 * Listen to one server event on the shared socket. The handler is read from a ref,
 * so an inline function doesn't re-subscribe on every render.
 */
export function useSocketEvent(event, handler) {
  const { socket } = useSocket()
  const ref = useRef(handler)

  useEffect(() => {
    ref.current = handler
  })

  useEffect(() => {
    if (!socket) return undefined
    const listener = (payload) => ref.current?.(payload)
    socket.on(event, listener)
    return () => socket.off(event, listener)
  }, [socket, event])
}
