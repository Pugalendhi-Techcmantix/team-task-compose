import { api, unwrap } from './client'

/**
 * Short-lived (15 min) token for the Node.js Socket.IO service.
 * Laravel issues it from the session cookie (+ X-XSRF-TOKEN, added by the axios client).
 * Never store it: the socket asks for a fresh one on every (re)connect.
 */
export async function fetchRealtimeToken() {
  const data = unwrap(await api.post('/realtime/token'))
  const token = data?.token
  if (!token) throw new Error('The server did not return a realtime token.')
  return token
}
