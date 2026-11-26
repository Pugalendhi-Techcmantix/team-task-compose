import Spinner from './Spinner'

const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-ink/90 disabled:bg-ink/50',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-faint disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-line-soft hover:text-ink disabled:text-ink-faint',
  danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50',
}

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}
