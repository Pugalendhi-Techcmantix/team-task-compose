import { Link } from 'react-router'

const iconBtn = 'grid size-10 place-items-center rounded-full text-ink-faint transition-[color,background-color,transform] hover:-translate-y-0.5'

export function EditLink({ to, label }) {
  return (
    <Link to={to} className={`${iconBtn} hover:bg-line-soft hover:text-ink`} aria-label={label} title={label}>
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z" strokeLinejoin="round" />
      </svg>
    </Link>
  )
}

export function EditButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} className={`${iconBtn} hover:bg-line-soft hover:text-ink`} aria-label={label} title={label}>
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M13.5 3.5l3 3L7 16l-4 1 1-4 9.5-9.5z" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

export function DeleteButton({ onClick, label, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${iconBtn} hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-ink-faint`}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

/** Primary-styled link button with a plus icon (for "New …" actions that navigate). */
export function PrimaryLink({ to, children }) {
  return (
    <Link
      to={to}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-white transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-ink/90"
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M10 4v12M4 10h12" strokeLinecap="round" />
      </svg>
      {children}
    </Link>
  )
}
