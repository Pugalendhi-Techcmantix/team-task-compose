import Spinner from './Spinner'
import Button from './Button'

export function LoadingState({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-line bg-surface py-16 text-sm text-ink-soft" role="status">
      <Spinner /> {label}
    </div>
  )
}

export function ErrorState({ title = "This couldn't be loaded", message, onRetry }) {
  return (
    <div className="rounded-2xl border border-danger/25 bg-surface px-6 py-12 text-center" role="alert">
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 text-sm text-ink-soft">{message}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, message, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 text-sm text-ink-soft">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ForbiddenState() {
  return (
    <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center" role="alert">
      <p className="font-semibold">You don't have access to this page</p>
      <p className="mt-1 text-sm text-ink-soft">Ask an administrator for access.</p>
    </div>
  )
}

/** Page title row with optional description and primary action. */
export function PageHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-3 text-xs font-bold tracking-[0.17em] text-ink-faint uppercase">Access control</p>
        <h1 className="text-[clamp(2.1rem,4vw,3.25rem)] leading-[0.95] font-extrabold tracking-[-0.05em] text-balance">{title}</h1>
        {description && <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
