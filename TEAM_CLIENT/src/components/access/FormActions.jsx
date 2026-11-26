import Button from '../ui/Button'

/** Sticky-on-mobile footer for full-page forms. */
export default function FormActions({ submitLabel, submitting, onCancel }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-8 flex flex-col-reverse gap-2 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
      <Button variant="secondary" className="!h-12 !rounded-full !px-5" onClick={onCancel} disabled={submitting}>
        Cancel
      </Button>
      <Button type="submit" className="!h-12 !rounded-full !px-6" loading={submitting}>
        {submitLabel}
      </Button>
    </div>
  )
}

/** Titled block inside a form page. */
export function FormSection({ title, description, children }) {
  return (
    <section className="rounded-[2rem] border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-ink/15 hover:shadow-[0_12px_32px_rgba(23,32,25,0.05)] sm:p-7">
      <div className="flex items-center gap-3">
        <span className="size-2.5 rounded-full bg-signal shadow-[0_0_0_5px_rgba(185,232,75,0.14)]" aria-hidden="true" />
        <h2 className="text-lg font-extrabold tracking-[-0.025em]">{title}</h2>
      </div>
      {description && <p className="mt-2 max-w-2xl pl-5.5 text-sm leading-relaxed text-ink-soft">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}
