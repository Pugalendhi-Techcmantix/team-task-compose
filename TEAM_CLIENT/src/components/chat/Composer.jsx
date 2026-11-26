import { useId, useRef, useState } from 'react'
import { MAX_MESSAGE_LENGTH } from '../../socket/realtimeErrors'

const COUNTER_FROM = MAX_MESSAGE_LENGTH - 200

/**
 * Message box. Enter sends, Shift+Enter adds a line. The text stays if sending fails.
 * `onSend(text)` → promise (throws a RealtimeError with a user-facing message).
 */
export default function Composer({ onSend, onTyping, onStopTyping, disabled = false, disabledReason = '', placeholder = 'Write a message' }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)
  const errorId = useId()
  const counterId = useId()

  const tooLong = text.length > MAX_MESSAGE_LENGTH
  const canSend = !disabled && !sending && text.trim().length > 0 && !tooLong

  const resize = (el) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  const submit = async () => {
    if (!canSend) return
    setSending(true)
    setError('')
    try {
      await onSend(text)
      setText('')
      if (inputRef.current) {
        inputRef.current.style.height = 'auto'
        inputRef.current.focus()
      }
    } catch (err) {
      setError(err?.message || 'Not sent, try again')
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form
      className="border-t border-line bg-surface px-3 pt-3 pb-3 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {error && (
        <p id={errorId} role="alert" className="mb-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor={`${errorId}-input`}>
          Message
        </label>
        <textarea
          id={`${errorId}-input`}
          ref={inputRef}
          rows={1}
          value={text}
          disabled={disabled}
          placeholder={disabled ? disabledReason || placeholder : placeholder}
          aria-invalid={tooLong || Boolean(error) || undefined}
          aria-describedby={[error ? errorId : null, text.length >= COUNTER_FROM ? counterId : null].filter(Boolean).join(' ') || undefined}
          onChange={(e) => {
            setText(e.target.value)
            if (error) setError('')
            resize(e.target)
            if (e.target.value) onTyping?.()
            else onStopTyping?.()
          }}
          onBlur={() => onStopTyping?.()}
          onKeyDown={onKeyDown}
          className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 text-[15px] leading-snug placeholder:text-ink-faint focus:border-ink/30 focus:bg-surface focus:ring-2 focus:ring-ink/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-white transition-colors hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:outline-none disabled:bg-ink/30"
          aria-label={sending ? 'Sending' : 'Send message'}
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M3.5 10h11M10.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex justify-between gap-3 px-1 text-xs text-ink-faint">
        <span className="hidden sm:inline">Enter to send, Shift+Enter for a new line</span>
        {text.length >= COUNTER_FROM && (
          <span id={counterId} className={`ml-auto tabular-nums ${tooLong ? 'font-semibold text-danger' : ''}`}>
            {text.length} / {MAX_MESSAGE_LENGTH}
          </span>
        )}
      </div>
    </form>
  )
}
