import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { chatApi, normalizeMessage } from '../../api/chat'
import { getErrorMessage } from '../../api/errors'
import { useFetch } from '../../hooks/useFetch'
import { conversationTitle, mergeMessages, typingText } from '../../lib/chat'
import { useConversation } from '../../socket/useConversation'
import Spinner from '../ui/Spinner'
import Avatar from './Avatar'
import Composer from './Composer'
import MessageList from './MessageList'

const NEAR_BOTTOM_PX = 120

/**
 * One open conversation: REST history + live socket messages, typing, composer.
 * Mount with key={conversationId} so state resets when switching chats.
 */
export default function ChatThread({ conversationId, conversation: fromList, meId, isOnline, onActivity }) {
  const live = useConversation(conversationId)
  const history = useFetch(async () => {
    const [conversation, page] = await Promise.all([
      fromList ? Promise.resolve(fromList) : chatApi.getConversation(conversationId),
      chatApi.listMessages(conversationId),
    ])
    return { conversation, ...page }
  }, [conversationId])

  const [older, setOlder] = useState({ items: [], hasMore: null, loading: false, error: '' })
  const scrollRef = useRef(null)
  const stick = useRef(true) // keep pinned to the newest message unless the user scrolled up
  const keepOffset = useRef(null) // restore position after loading earlier messages

  const conversation = history.data?.conversation ?? fromList ?? null
  const hasMore = older.hasMore ?? history.data?.hasMore ?? false
  const liveMessages = useMemo(() => live.messages.map(normalizeMessage), [live.messages])
  const messages = useMemo(
    () => mergeMessages(older.items, history.data?.items ?? [], liveMessages),
    [older.items, history.data, liveMessages],
  )

  const members = useMemo(() => new Map((conversation?.members ?? []).map((u) => [String(u.id), u.name])), [conversation])
  const nameOf = (m) => m.senderName ?? members.get(String(m.senderId)) ?? 'Someone'
  const direct = Boolean(conversation && !conversation.name && conversation.members.length === 2)
  const other = direct ? conversation.members.find((u) => String(u.id) !== String(meId)) : null
  const typing = typingText(live.typingUserIds.map((id) => members.get(String(id))?.split(' ')[0] ?? 'Someone'))

  // newest live message → update the list preview
  const lastLive = liveMessages.at(-1)
  useEffect(() => {
    if (lastLive) onActivity?.(conversationId, lastLive)
  }, [lastLive, conversationId, onActivity])

  // scrolling: stay at the bottom for new messages; keep place when older ones are prepended
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current
      keepOffset.current = null
    } else if (stick.current || String(messages.at(-1)?.senderId) === String(meId)) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, meId, typing])

  const onScroll = (e) => {
    const el = e.currentTarget
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  const loadEarlier = async () => {
    const oldest = messages[0]
    if (!oldest) return
    setOlder((o) => ({ ...o, loading: true, error: '' }))
    try {
      const page = await chatApi.listMessages(conversationId, { before: oldest.id })
      keepOffset.current = scrollRef.current ? scrollRef.current.scrollHeight - scrollRef.current.scrollTop : null
      setOlder((o) => ({ items: [...page.items, ...o.items], hasMore: page.hasMore, loading: false, error: '' }))
    } catch (err) {
      setOlder((o) => ({ ...o, loading: false, error: getErrorMessage(err) }))
    }
  }

  const denied = live.joinState === 'denied' || history.errorStatus === 403
  const offline = live.connection !== 'live'
  const composerBlocked = denied || offline || live.joinState !== 'joined'
  const blockedReason = offline ? 'Reconnecting… you can send when Live again' : 'Joining the conversation…'

  return (
    <section className="relative flex h-full min-h-0 flex-col" aria-labelledby="chat-title">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-3 sm:px-5">
        <Link to="/chat" className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-line-soft hover:text-ink lg:hidden" aria-label="Back to conversations">
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M12.5 4.5L7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <Avatar name={other?.name ?? conversation?.name} group={!direct} online={Boolean(other && isOnline(other.id))} />
        <div className="min-w-0">
          <h2 id="chat-title" className="truncate text-base font-bold">
            {conversation ? conversationTitle(conversation, meId) : 'Conversation'}
          </h2>
          <p className="truncate text-xs text-ink-soft">
            {denied
              ? 'No access'
              : direct
              ? other && isOnline(other.id)
                ? 'Online'
                : 'Direct message'
              : `${conversation?.members.length ?? 0} members`}
          </p>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {lastLive && String(lastLive.senderId) !== String(meId) ? `New message from ${nameOf(lastLive)}: ${lastLive.message}` : ''}
      </p>
      <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto bg-paper/50 px-3 py-4 sm:px-6">
        {denied ? (
          <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-line bg-surface px-6 py-10 text-center" role="alert">
            <p className="font-semibold">You&apos;re not a member of this conversation</p>
            <p className="mt-1 text-sm text-ink-soft">Ask someone in it to add you.</p>
            <Link to="/chat" className="mt-5 inline-block text-sm font-semibold underline underline-offset-4">
              Back to your conversations
            </Link>
          </div>
        ) : history.status === 'loading' ? (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-ink-soft" role="status">
            <Spinner /> Loading messages
          </div>
        ) : history.status === 'error' ? (
          <div className="mx-auto mt-10 max-w-sm text-center" role="alert">
            <p className="font-semibold">Messages couldn&apos;t be loaded</p>
            <p className="mt-1 text-sm text-ink-soft">{history.error}</p>
            <button type="button" onClick={history.reload} className="mt-4 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-ink-faint">
              Try again
            </button>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="mb-4 text-center">
                <button
                  type="button"
                  onClick={loadEarlier}
                  disabled={older.loading}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink disabled:opacity-60"
                >
                  {older.loading && <Spinner className="size-4" />} Load earlier messages
                </button>
                {older.error && <p className="mt-2 text-sm text-danger">{older.error}</p>}
              </div>
            )}
            {messages.length === 0 ? (
              <p className="mt-10 text-center text-sm text-ink-soft">No messages yet. Say hello.</p>
            ) : (
              <MessageList messages={messages} meId={meId} nameOf={nameOf} showNames={!direct} />
            )}
          </>
        )}
      </div>

      <p className="h-6 bg-paper/50 px-4 text-xs text-ink-soft sm:px-6" aria-live="polite">
        {typing && (
          <span className="inline-flex items-center gap-1.5">
            <span className="flex gap-0.5" aria-hidden="true">
              <span className="size-1 animate-bounce rounded-full bg-ink-faint motion-reduce:animate-none" />
              <span className="size-1 animate-bounce rounded-full bg-ink-faint [animation-delay:120ms] motion-reduce:animate-none" />
              <span className="size-1 animate-bounce rounded-full bg-ink-faint [animation-delay:240ms] motion-reduce:animate-none" />
            </span>
            {typing}
          </span>
        )}
      </p>

      {!denied && (
        <Composer
          onSend={live.send}
          onTyping={live.typing}
          onStopTyping={live.stopTyping}
          disabled={composerBlocked}
          disabledReason={blockedReason}
        />
      )}
    </section>
  )
}
