import { initials } from '../../lib/format'

/** Initials circle; `online` adds the live dot. `group` shows a two-person mark instead. */
export default function Avatar({ name, online = false, group = false, size = 'md', dark = false }) {
  const box = size === 'sm' ? 'size-8 text-[11px]' : 'size-10 text-xs'
  const tone = dark ? 'bg-ink text-white' : 'bg-line-soft text-ink-soft'
  return (
    <span className={`relative grid shrink-0 place-items-center rounded-full font-bold ${box} ${tone}`} aria-hidden="true">
      {group ? (
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
          <circle cx="7.5" cy="7" r="2.6" />
          <circle cx="13.5" cy="8" r="2.1" />
          <path d="M3 15.5c.6-2.4 2.4-3.8 4.5-3.8s3.9 1.4 4.5 3.8M12 12.2c.5-.2 1-.3 1.5-.3 1.7 0 3.1 1.1 3.5 3" strokeLinecap="round" />
        </svg>
      ) : (
        initials(name)
      )}
      {online && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-signal" />}
    </span>
  )
}
