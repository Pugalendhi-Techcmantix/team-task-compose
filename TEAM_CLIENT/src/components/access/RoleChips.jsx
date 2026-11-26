import { humanize } from '../../lib/roles'

const nameOf = (r) => (typeof r === 'string' ? r : r?.name)

export default function RoleChips({ roles = [], empty = 'No role' }) {
  const names = roles.map(nameOf).filter(Boolean)
  if (names.length === 0) return <span className="text-sm text-ink-faint">{empty}</span>
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Roles">
      {names.map((n) => (
        <li key={n} className="rounded-full border border-st-done/15 bg-signal-soft px-2.5 py-1 text-xs font-bold text-st-done">
          {humanize(n)}
        </li>
      ))}
    </ul>
  )
}
