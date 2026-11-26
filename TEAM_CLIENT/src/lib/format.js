const DAY = 86_400_000

const toLocalDay = (yyyyMmDd) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** "Due today" / "Due tomorrow" / "Overdue by 3 days" / "Due 4 Dec". */
export function formatDue(dueDate, now = new Date()) {
  if (!dueDate) return null
  const due = toLocalDay(String(dueDate).slice(0, 10))
  if (Number.isNaN(due.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((due - today) / DAY)

  if (diff === 0) return { text: 'Due today', overdue: false, soon: true }
  if (diff === 1) return { text: 'Due tomorrow', overdue: false, soon: true }
  if (diff < 0) return { text: `Overdue by ${-diff} day${diff === -1 ? '' : 's'}`, overdue: true, soon: false }
  const sameYear = due.getFullYear() === today.getFullYear()
  const label = due.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
  return { text: `Due ${label}`, overdue: false, soon: false }
}

/** "just now" / "4 min ago" / "2 h ago" / date. */
export function formatAgo(timestamp, now = Date.now()) {
  const s = Math.max(0, Math.round((now - timestamp) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(timestamp).toLocaleDateString()
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '?'
