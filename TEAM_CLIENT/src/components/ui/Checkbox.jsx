import { useEffect, useRef } from 'react'

/** Native checkbox with label + optional hint; supports `indeterminate`. */
export default function Checkbox({ label, hint, indeterminate = false, className = '', ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <label className={`flex cursor-pointer items-start gap-2.5 ${props.disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line accent-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm leading-5 font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs leading-snug text-ink-faint">{hint}</span>}
      </span>
    </label>
  )
}
