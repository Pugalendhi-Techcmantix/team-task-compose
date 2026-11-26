import Button from './Button'

export default function Pagination({ meta, onPage, label = 'items' }) {
  if (!meta || meta.lastPage <= 1) return null
  const from = (meta.page - 1) * meta.perPage + 1
  const to = Math.min(meta.page * meta.perPage, meta.total)

  return (
    <nav className="flex items-center justify-between gap-4 pt-4" aria-label="Pagination">
      <p className="text-sm text-ink-soft">
        {from}–{to} of {meta.total} {label}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={meta.page >= meta.lastPage} onClick={() => onPage(meta.page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
