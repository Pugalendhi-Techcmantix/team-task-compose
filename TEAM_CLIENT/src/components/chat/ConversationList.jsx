import { NavLink } from 'react-router'
import { conversationTitle } from '../../lib/chat'
import { formatAgo } from '../../lib/format'
import Avatar from './Avatar'

const otherMember = (c, meId) => c.members.find((u) => String(u.id) !== String(meId))

/** Left pane: your conversations, newest activity first. */
export default function ConversationList({ conversations, meId, isOnline }) {
  return (
    <ul className="divide-y divide-line-soft" aria-label="Conversations">
      {conversations.map((c) => {
        const direct = !c.name && c.members.length === 2
        const other = direct ? otherMember(c, meId) : null
        const last = c.lastMessage
        const lastBy = last
          ? String(last.senderId) === String(meId)
            ? 'You: '
            : direct
              ? ''
              : `${(last.senderName ?? c.members.find((u) => String(u.id) === String(last.senderId))?.name ?? '').split(' ')[0]}: `
          : ''
        return (
          <li key={c.id}>
            <NavLink
              to={`/chat/${c.id}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3.5 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
                  isActive ? 'bg-signal-soft shadow-[inset_3px_0_0_var(--color-ink)]' : 'hover:bg-line-soft/60'
                }`
              }
            >
              <Avatar name={other?.name ?? c.name} group={!direct} online={Boolean(other && isOnline(other.id))} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold">{conversationTitle(c, meId)}</span>
                  {last?.createdAt && <span className="shrink-0 text-xs text-ink-faint">{formatAgo(Date.parse(last.createdAt))}</span>}
                </span>
                <span className="mt-0.5 block truncate text-sm text-ink-soft">
                  {last ? `${lastBy}${last.message}` : <span className="text-ink-faint">No messages yet</span>}
                </span>
              </span>
            </NavLink>
          </li>
        )
      })}
    </ul>
  )
}
