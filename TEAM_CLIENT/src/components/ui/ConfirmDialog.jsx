import Modal from './Modal'
import Button from './Button'

/** Destructive-action confirmation. `children` explains the consequence. */
export default function ConfirmDialog({ open, title, confirmLabel, cancelLabel = 'Cancel', busy, onConfirm, onClose, children }) {
  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onClose} size="sm">
      <div className="text-sm text-ink-soft">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
