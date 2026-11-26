import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { chatApi } from '../../api/chat'
import { useAuth } from '../../context/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { usePresence } from '../../socket/usePresence'
import ConversationList from '../../components/chat/ConversationList'
import ChatThread from '../../components/chat/ChatThread'
import NewConversationDialog from '../../components/chat/NewConversationDialog'
import Spinner from '../../components/ui/Spinner'

const byActivity = (a, b) => String(b.lastMessage?.createdAt ?? b.updatedAt ?? '').localeCompare(String(a.lastMessage?.createdAt ?? a.updatedAt ?? ''))

/**
 * /chat and /chat/:conversationId. Desktop: list + thread side by side.
 * Phone: the list, or the open thread with a back button.
 */
export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isOnline } = usePresence()
  const [creating, setCreating] = useState(false)
  const list = useFetch(() => chatApi.listConversations(), [])

  const conversations = [...(list.data ?? [])].sort(byActivity)
  const active = conversations.find((c) => String(c.id) === String(conversationId)) ?? null

  const onActivity = useCallback(
    (id, message) =>
      list.setData((items) =>
        items?.map((c) => (String(c.id) === String(id) && c.lastMessage?.id !== message.id ? { ...c, lastMessage: message } : c)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setData is stable
    [],
  )

  const onCreated = (conversation) => {
    list.setData((items) => [conversation, ...(items ?? []).filter((c) => String(c.id) !== String(conversation.id))])
    navigate(`/chat/${conversation.id}`)
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-0 sm:px-6 sm:py-6">
      <div className="grid h-[calc(100dvh-7.5rem)] overflow-hidden border-line bg-surface sm:h-[calc(100dvh-10.25rem)] sm:rounded-2xl sm:border lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[340px_1fr]">
        <aside className={`min-h-0 flex-col border-line lg:flex lg:border-r ${conversationId ? 'hidden' : 'flex'}`} aria-label="Your conversations">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h1 className="text-xl font-extrabold tracking-tight">Chat</h1>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-white hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              New
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.status === 'loading' && !list.data ? (
              <p className="flex items-center gap-2 px-4 py-8 text-sm text-ink-soft" role="status">
                <Spinner className="size-4" /> Loading conversations
              </p>
            ) : list.status === 'error' ? (
              <div className="px-4 py-8 text-sm" role="alert">
                <p className="font-semibold">Conversations couldn&apos;t be loaded</p>
                <p className="mt-1 text-ink-soft">{list.error}</p>
                <button type="button" onClick={list.reload} className="mt-3 font-semibold underline underline-offset-4">
                  Try again
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-semibold">No conversations yet</p>
                <p className="mt-1 text-sm text-ink-soft">Start one with a teammate.</p>
              </div>
            ) : (
              <ConversationList conversations={conversations} meId={user?.id} isOnline={isOnline} />
            )}
          </div>
        </aside>

        <div className={`min-h-0 ${conversationId ? 'block' : 'hidden lg:block'}`}>
          {conversationId ? (
            <ChatThread
              key={conversationId}
              conversationId={Number.isNaN(Number(conversationId)) ? conversationId : Number(conversationId)}
              conversation={active}
              meId={user?.id}
              isOnline={isOnline}
              onActivity={onActivity}
            />
          ) : (
            <div className="grid h-full place-items-center bg-paper/50 px-6 text-center">
              <div>
                <p className="text-lg font-bold">Pick a conversation</p>
                <p className="mt-1 text-sm text-ink-soft">Or start a new one with the New button.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewConversationDialog open={creating} meId={user?.id} onClose={() => setCreating(false)} onCreated={onCreated} />
    </main>
  )
}
