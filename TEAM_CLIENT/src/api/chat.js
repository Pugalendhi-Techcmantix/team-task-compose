import { api, unwrap } from './client'

/**
 * Chat REST (Laravel). PROPOSED contract, PLAN.md "Phase 3 — Chat" (routes 404 on 2026-11-26).
 * Sending and live delivery go through the Node socket (useConversation), not REST.
 */

const pick = (...values) => values.find((v) => v !== undefined && v !== null)

/** Socket (camelCase) and Laravel (snake_case) messages → one shape. */
export function normalizeMessage(m) {
  if (!m) return null
  return {
    id: m.id,
    conversationId: pick(m.conversationId, m.conversation_id),
    senderId: pick(m.senderId, m.sender_id, m.sender?.id),
    senderName: pick(m.senderName, m.sender?.name) ?? null,
    message: m.message ?? m.body ?? '',
    createdAt: pick(m.createdAt, m.created_at) ?? null,
  }
}

export function normalizeConversation(c) {
  if (!c) return null
  const last = pick(c.lastMessage, c.last_message)
  return {
    id: c.id,
    name: c.name ?? null,
    type: c.type ?? null,
    members: Array.isArray(c.members) ? c.members.map((u) => ({ id: u.id, name: u.name })) : [],
    lastMessage: last ? normalizeMessage(last) : null,
    updatedAt: pick(c.updatedAt, c.updated_at) ?? null,
  }
}

/**
 * POST /conversations body (Laravel, confirmed by its 422s on 2026-11-26):
 * - direct: { type: 'direct', user_id }            ← user_id required ✅
 * - group:  { type: 'group', user_ids, name|null } ← field name ❓ (same naming, not confirmed)
 */
export function toConversationPayload({ memberIds, name }) {
  const ids = [...new Set(memberIds.map(Number))]
  if (ids.length === 1) return { type: 'direct', user_id: ids[0] }
  return { type: 'group', user_ids: ids, name: name?.trim() || null }
}

export const chatApi = {
  async listConversations() {
    const data = unwrap(await api.get('/conversations'))
    return (Array.isArray(data) ? data : []).map(normalizeConversation)
  },

  async getConversation(id) {
    return normalizeConversation(unwrap(await api.get(`/conversations/${id}`)))
  },

  /** Start a conversation with these users (you are added by the backend). */
  async createConversation({ memberIds, name }) {
    const body = toConversationPayload({ memberIds, name })
    return normalizeConversation(unwrap(await api.post('/conversations', body)))
  },

  /**
   * One page of history, oldest → newest. `before` = id of the oldest message you have.
   * @returns {Promise<{ items: Message[], hasMore: boolean }>}
   */
  async listMessages(conversationId, { before, limit = 30 } = {}) {
    const res = await api.get(`/conversations/${conversationId}/messages`, {
      params: { limit, ...(before !== undefined && before !== null && { before }) },
    })
    const body = res.data ?? {}
    const raw = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : []
    const hasMore = Boolean(body.meta?.has_more ?? body.meta?.hasMore ?? false)
    return { items: raw.map(normalizeMessage), hasMore }
  },
}
