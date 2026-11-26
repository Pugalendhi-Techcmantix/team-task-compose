import { useId } from 'react'

export const controlClass =
  'block w-full rounded-lg border bg-surface px-3 text-[15px] text-ink placeholder:text-ink-faint ' +
  'transition-colors focus:outline-none focus:ring-2 focus:ring-ink/15 disabled:bg-line-soft ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20'

/**
 * Label + control + error/hint. `children` is a render function receiving
 * the a11y props to spread onto the control.
 */
export default function Field({ label, error, hint, optional = false, className = '', children }) {
  const id = useId()
  const msgId = `${id}-msg`
  const control = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? msgId : undefined,
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-faint">Optional</span>}
      </label>
      {children(control)}
      {(error || hint) && (
        <p id={msgId} className={`mt-1.5 text-sm ${error ? 'text-danger' : 'text-ink-faint'}`}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export function TextInput(props) {
  return <input {...props} className={`${controlClass} h-11 border-line ${props.className ?? ''}`} />
}

export function TextArea(props) {
  return <textarea {...props} className={`${controlClass} min-h-24 border-line py-2.5 ${props.className ?? ''}`} />
}

export function SelectInput({ options, ...props }) {
  return (
    <select {...props} className={`${controlClass} h-11 border-line pr-8 ${props.className ?? ''}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
