import { STATUS_STYLE } from '../../lib/taskStatus'

const UNKNOWN_STATUS = { dot: 'bg-ink-faint', text: 'text-ink-faint' }

const PRIORITY = {
  low: { label: 'Low', cls: 'text-ink-faint' },
  medium: { label: 'Medium', cls: 'text-ink-soft' },
  high: { label: 'High priority', cls: 'text-danger font-semibold' },
}

const statusMeta = (s) => STATUS_STYLE[s] ?? UNKNOWN_STATUS

export function StatusDot({ status, className = 'size-2' }) {
  return <span className={`inline-block shrink-0 rounded-full ${statusMeta(status).dot} ${className}`} aria-hidden="true" />
}

export function PriorityLabel({ priority }) {
  const p = PRIORITY[priority] ?? PRIORITY.medium
  return <span className={`text-xs ${p.cls}`}>{p.label}</span>
}
