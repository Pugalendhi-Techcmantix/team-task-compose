import { STATUS_OPTIONS } from '../../lib/taskStatus'
import { motion } from 'framer-motion'

const TABS = [{ value: 'all', label: 'All' }, ...STATUS_OPTIONS]

/** Status tabs that double as the counts summary, plus a search box. */
export default function TaskFilters({ counts, status, onStatusChange, query, onQueryChange }) {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div role="tablist" aria-label="Filter by status" className="flex gap-1 overflow-x-auto rounded-xl bg-paper p-1">
        {TABS.map((t) => {
          const active = status === t.value
          return (
            <motion.button
              key={t.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onStatusChange(t.value)}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={`group flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors ${
                active ? 'bg-ink text-white shadow-sm' : 'text-ink-soft hover:bg-surface hover:text-ink'
              }`}
            >
              <span>{t.label}</span>
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${active ? 'bg-white/15 text-white' : 'bg-line-soft text-ink-faint'}`}>
                {counts[t.value] ?? 0}
              </span>
            </motion.button>
          )
        })}
      </div>

      <label className="relative block xl:w-72">
        <span className="sr-only">Search tasks</span>
        <svg viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13.5 13.5L17 17" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search tasks"
          className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm placeholder:text-ink-faint focus:ring-2 focus:ring-ink/15 focus:outline-none"
        />
      </label>
    </div>
  )
}
