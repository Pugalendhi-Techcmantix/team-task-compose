import { memo } from 'react'
import { motion } from 'framer-motion'
import { formatDue } from '../../lib/format'
import { STATUS_OPTIONS, STATUS_STYLE, isDone } from '../../lib/taskStatus'
import { PriorityLabel, StatusDot } from '../ui/Badge'

function TaskRow({ task, fresh, busy, onStatusChange, onEdit, onDelete }) {
  const done = isDone(task.status)
  const due = done ? null : formatDue(task.due_date)
  // A status the UI doesn't know (backend mismatch) stays visible instead of silently showing "Todo".
  const options = STATUS_OPTIONS.some((o) => o.value === task.status)
    ? STATUS_OPTIONS
    : [{ value: task.status ?? '', label: task.status || 'No status' }, ...STATUS_OPTIONS]

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={`group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-4 shadow-[0_1px_0_rgba(23,32,25,0.04)] transition-[border-color,box-shadow] hover:border-ink/20 hover:shadow-[0_12px_30px_rgba(23,32,25,0.08)] sm:flex-row sm:items-center sm:gap-5 sm:px-5 ${fresh ? 'animate-arrive' : ''}`}
      aria-busy={busy || undefined}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <StatusDot status={task.status} className="mt-2 size-2.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className={`text-[15px] leading-snug font-semibold break-words ${done ? 'text-ink-faint line-through decoration-ink-faint/50' : ''}`}>
              {task.title}
            </h3>
            {fresh && <span className="text-xs font-semibold text-signal">Just now</span>}
          </div>
          {task.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{task.description}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <PriorityLabel priority={task.priority} />
            {due && (
              <span className={`text-xs ${due.overdue ? 'font-semibold text-danger' : due.soon ? 'font-medium text-st-progress' : 'text-ink-faint'}`}>
                {due.text}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 pl-5.5 sm:pl-0">
        <label className="sr-only" htmlFor={`status-${task.id}`}>
          Status for {task.title}
        </label>
        <select
          id={`status-${task.id}`}
          value={task.status}
          disabled={busy}
          onChange={(e) => onStatusChange(task, e.target.value)}
          className={`h-9 rounded-lg border border-line bg-surface pr-7 pl-2.5 text-sm font-medium focus:ring-2 focus:ring-ink/15 focus:outline-none disabled:opacity-60 ${STATUS_STYLE[task.status]?.text ?? ''}`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="grid size-9 place-items-center rounded-lg text-ink-faint hover:bg-line-soft hover:text-ink"
          aria-label={`Edit ${task.title}`}
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onDelete(task)}
          className="grid size-9 place-items-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger"
          aria-label={`Delete ${task.title}`}
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </motion.li>
  )
}

export default memo(TaskRow)
