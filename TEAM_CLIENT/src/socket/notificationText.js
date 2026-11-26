/** "Title: message", or whichever of the two exists. */
export function notificationText(n) {
  if (!n) return ''
  if (typeof n === 'string') return n
  const title = n.title?.trim()
  const message = n.message?.trim()
  if (title && message && title !== message) return `${title}: ${message}`
  return title || message || ''
}
