import { useState } from 'react'
import { SOCKET_EVENTS } from './socket'
import { useSocketEvent } from './useSocketEvent'

/**
 * Online / offline per user from `presence:update` events seen since this component
 * mounted ({ [userId]: { status, at } }). There is no initial list over the socket.
 */
export function usePresence() {
  const [presence, setPresence] = useState({})

  useSocketEvent(SOCKET_EVENTS.PRESENCE, (p) => {
    if (p?.userId === undefined || p?.userId === null) return
    setPresence((all) => ({ ...all, [String(p.userId)]: { status: p.status, at: p.at } }))
  })

  const isOnline = (userId) => presence[String(userId)]?.status === 'online'
  return { presence, isOnline }
}
