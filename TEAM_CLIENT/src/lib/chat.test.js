import { describe, it, expect } from 'vitest'
import { conversationTitle, dayLabel, groupMessages, mergeMessages, typingText } from './chat'
import { normalizeConversation, normalizeMessage, toConversationPayload } from '../api/chat'

describe('toConversationPayload', () => {
  it('sends { type: direct, user_id } for one person (backend: user_id required)', () => {
    expect(toConversationPayload({ memberIds: ['4'], name: 'ignored' })).toEqual({ type: 'direct', user_id: 4 })
  })

  it('sends { type: group, user_ids, name } for several people', () => {
    expect(toConversationPayload({ memberIds: [4, 5, 5], name: ' Release crew ' })).toEqual({ type: 'group', user_ids: [4, 5], name: 'Release crew' })
    expect(toConversationPayload({ memberIds: [4, 5], name: '' })).toEqual({ type: 'group', user_ids: [4, 5], name: null })
  })
})

const m = (id, senderId, createdAt, extra = {}) => ({ id, conversationId: 1, senderId, message: `m${id}`, createdAt, ...extra })

describe('normalizeMessage', () => {
  it('turns socket (camelCase) and Laravel (snake_case) messages into one shape', () => {
    const fromSocket = { id: 1, conversationId: 3, senderId: 7, message: 'hi', createdAt: '2026-11-26T10:00:00Z' }
    const fromRest = { id: 1, conversation_id: 3, sender_id: 7, sender: { id: 7, name: 'Priya' }, message: 'hi', created_at: '2026-11-26T10:00:00Z' }
    expect(normalizeMessage(fromSocket)).toEqual({ ...fromSocket, senderName: null })
    expect(normalizeMessage(fromRest)).toEqual({ ...fromSocket, senderName: 'Priya' })
  })

  it('normalises a conversation with its last message', () => {
    const c = normalizeConversation({ id: 2, name: null, members: [{ id: 1, name: 'A', email: 'x' }], last_message: { id: 9, sender_id: 1, message: 'yo', created_at: 't' } })
    expect(c.members).toEqual([{ id: 1, name: 'A' }])
    expect(c.lastMessage).toMatchObject({ id: 9, senderId: 1, message: 'yo' })
  })
})

describe('mergeMessages', () => {
  it('dedupes history and live messages and sorts oldest first', () => {
    const history = [m(2, 1, '2026-11-26T10:01:00Z'), m(1, 1, '2026-11-26T10:00:00Z')]
    const live = [m(2, 1, '2026-11-26T10:01:00Z'), m(3, 2, '2026-11-26T10:02:00Z')]
    expect(mergeMessages(history, live).map((x) => x.id)).toEqual([1, 2, 3])
  })
})

describe('conversationTitle', () => {
  const members = [{ id: 1, name: 'Me' }, { id: 2, name: 'Priya' }, { id: 3, name: 'Sam' }]
  it('uses the name, else the other members', () => {
    expect(conversationTitle({ name: 'General', members }, 1)).toBe('General')
    expect(conversationTitle({ name: null, members }, 1)).toBe('Priya, Sam')
    expect(conversationTitle({ name: null, members: [{ id: 1, name: 'Me' }] }, 1)).toBe('Just you')
  })
})

describe('typingText', () => {
  it('reads naturally for 1, 2 and many people', () => {
    expect(typingText([])).toBe('')
    expect(typingText(['Priya'])).toBe('Priya is typing')
    expect(typingText(['Priya', 'Sam'])).toBe('Priya and Sam are typing')
    expect(typingText(['A', 'B', 'C'])).toBe('3 people are typing')
  })
})

describe('groupMessages', () => {
  it('splits by day and starts a new run on sender change or a 5-minute gap', () => {
    const days = groupMessages([
      m(1, 1, '2026-11-25T10:00:00Z'),
      m(2, 1, '2026-11-26T10:00:00Z'),
      m(3, 1, '2026-11-26T10:01:00Z'),
      m(4, 2, '2026-11-26T10:02:00Z'),
      m(5, 2, '2026-11-26T10:30:00Z'),
    ])
    expect(days).toHaveLength(2)
    expect(days[1].items.map((x) => x.startsRun)).toEqual([true, false, true, true])
  })
})

describe('dayLabel', () => {
  it('says Today and Yesterday', () => {
    const now = new Date('2026-11-26T12:00:00')
    expect(dayLabel('2026-11-26T09:00:00', now)).toBe('Today')
    expect(dayLabel('2026-11-25T09:00:00', now)).toBe('Yesterday')
  })
})
