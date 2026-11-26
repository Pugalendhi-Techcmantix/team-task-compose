import { useNotifications } from '../../context/NotificationContext'

const TONE = {
  info: 'bg-ink text-white',
  success: 'bg-ink text-white',
  live: 'bg-ink text-white shadow-[inset_4px_0_0_var(--color-signal)]',
  error: 'bg-danger text-white',
}

export default function ToastStack() {
  const { toasts, dismiss } = useNotifications()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ${TONE[t.tone] ?? TONE.info}`}
        >
          {t.tone === 'live' && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-signal" aria-hidden="true" />}
          <p className="flex-1 leading-snug">{t.message}</p>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="-m-1 rounded p-1 text-white/70 hover:text-white"
            aria-label="Dismiss notification"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
