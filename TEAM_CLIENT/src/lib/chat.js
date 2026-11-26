const time = (m) => {
  const t = Date.parse(m?.createdAt ?? '')
  return Number.isNaN(t) ? 0 : t
}

/** History + live messages → one list, unique by id, oldest first. */
export function mergeMessages(...lists) {
  const byId = new Map()
  for (const list of lists) for (const m of list ?? []) if (m && m.id !== undefined) byId.set(String(m.id), m)
  return [...byId.values()].sort((a, b) => time(a) - time(b) || Number(a.id) - Number(b.id))
}

/** Conversation name, or the other members' names for an unnamed (direct) chat. */
export function conversationTitle(conversation, meId) {
  if (!conversation) return ''
  if (conversation.name) return conversation.name
  const others = conversation.members.filter((u) => String(u.id) !== String(meId)).map((u) => u.name)
  if (others.length === 0) return 'Just you'
  if (others.length <= 3) return others.join(', ')
  return `${others.slice(0, 2).join(', ')} and ${others.length - 2} others`
}

/** "Priya is typing", "Priya and Sam are typing", "3 people are typing". */
export function typingText(names) {
  const list = names.filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return `${list[0]} is typing`
  if (list.length === 2) return `${list[0]} and ${list[1]} are typing`
  return `${list.length} people are typing`
}

/** Split into runs by day, and mark where a new sender starts (for name + spacing). */
export function groupMessages(messages) {
  const days = []
  for (const m of messages) {
    const day = m.createdAt ? new Date(m.createdAt).toDateString() : 'unknown'
    let bucket = days.at(-1)
    if (!bucket || bucket.day !== day) {
      bucket = { day, date: m.createdAt, items: [] }
      days.push(bucket)
    }
    const prev = bucket.items.at(-1)
    const gapMs = prev ? time(m) - time(prev) : Infinity
    bucket.items.push({ ...m, startsRun: !prev || String(prev.senderId) !== String(m.senderId) || gapMs > 5 * 60_000 })
  }
  return days
}

const sameDay = (a, b) => a.toDateString() === b.toDateString()

/** "Today" / "Yesterday" / "Mon 24 Nov". */
export function dayLabel(iso, now = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (sameDay(d, now)) return 'Today'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export const timeLabel = (iso) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')
