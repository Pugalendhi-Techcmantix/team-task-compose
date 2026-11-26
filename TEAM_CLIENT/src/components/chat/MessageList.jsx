import { dayLabel, groupMessages, timeLabel } from '../../lib/chat'

/** Day-separated message runs. Your messages sit right in ink; others left on white. */
export default function MessageList({ messages, meId, nameOf, showNames }) {
  const days = groupMessages(messages)
  return (
    <ol className="space-y-6" aria-label="Messages">
      {days.map((d) => (
        <li key={d.day}>
          <p className="sticky top-0 z-10 mx-auto mb-4 w-fit rounded-full border border-line bg-paper px-3 py-1 text-xs font-semibold text-ink-soft">
            {dayLabel(d.date)}
          </p>
          <ol className="space-y-1">
            {d.items.map((m) => {
              const mine = String(m.senderId) === String(meId)
              return (
                <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${m.startsRun ? 'pt-3' : ''}`}>
                  {m.startsRun && !mine && showNames ? (
                    <span className="mb-1 px-1 text-xs font-semibold text-ink-soft">{nameOf(m)}</span>
                  ) : (
                    <span className="sr-only">{mine ? 'You' : nameOf(m)}:</span>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug wrap-break-word whitespace-pre-wrap sm:max-w-[70%] ${
                      mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md border border-line bg-surface text-ink'
                    }`}
                  >
                    {m.message}
                    <time dateTime={m.createdAt ?? undefined} className={`ml-2 inline-block translate-y-0.5 text-[11px] ${mine ? 'text-white/60' : 'text-ink-faint'}`}>
                      {timeLabel(m.createdAt)}
                    </time>
                  </div>
                </li>
              )
            })}
          </ol>
        </li>
      ))}
    </ol>
  )
}
