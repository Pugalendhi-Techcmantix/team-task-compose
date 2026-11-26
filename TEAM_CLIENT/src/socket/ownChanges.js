/**
 * Tasks this tab just changed itself. A realtime notification about them is our own
 * change coming back, so it doesn't need a toast. Shared by the dashboard (which marks)
 * and RealtimeNotifier (which checks).
 */
const OWN_ECHO_MS = 10_000
const own = new Map() // id → timeout

export function markOwnTask(id) {
  if (id === undefined || id === null) return
  const k = String(id)
  clearTimeout(own.get(k))
  own.set(k, setTimeout(() => own.delete(k), OWN_ECHO_MS))
}

export const isOwnTask = (id) => id !== undefined && id !== null && own.has(String(id))
