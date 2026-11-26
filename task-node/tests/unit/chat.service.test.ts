import { describe, expect, it } from 'vitest';
import { ChatService, type SocketSession } from '../../src/services/chat.service.js';
import {
  AllowAllDevConversationAuthorizer,
  DenyAllConversationAuthorizer,
  type ConversationAuthorizer,
} from '../../src/services/conversation.authorizer.js';
import { RealtimeOnlyMessagePersistence } from '../../src/services/message.persistence.js';
import { AppError } from '../../src/utils/errors.js';
import { createSilentLogger } from '../../src/utils/logger.js';
import {
  RecordingEmitter,
  RecordingMessagePersistence,
  StaticConversationAuthorizer,
} from '../helpers/mocks.js';

function session(userId: number, id = `sock-${userId}`): SocketSession {
  const rooms = new Set<string>([id]);
  return {
    id,
    userId,
    join: (room) => void rooms.add(room),
    leave: (room) => void rooms.delete(room),
    isInRoom: (room) => rooms.has(room),
    conversations: () =>
      [...rooms].filter((r) => r.startsWith('conversation:')).map((r) => Number(r.split(':')[1])),
  };
}

function setup(
  authorizer: ConversationAuthorizer = new StaticConversationAuthorizer({ 10: [25, 30] })
) {
  const emitter = new RecordingEmitter();
  const persistence = new RecordingMessagePersistence();
  const chat = new ChatService({
    emitter,
    authorizer,
    persistence,
    logger: createSilentLogger(),
    maxMessageLength: 100,
  });
  return { chat, emitter, persistence };
}

async function errorCode(promise: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).code;
  }
  throw new Error('expected an error');
}

describe('ChatService', () => {
  it('joins an authorized conversation and rejects others', async () => {
    const { chat } = setup();
    const user25 = session(25);
    await expect(chat.joinConversation(user25, { conversationId: 10 })).resolves.toEqual({
      conversationId: 10,
    });
    expect(user25.isInRoom('conversation:10')).toBe(true);
    expect(await errorCode(chat.joinConversation(session(99), { conversationId: 10 }))).toBe(
      'CONVERSATION_ACCESS_DENIED'
    );
    expect(await errorCode(chat.joinConversation(user25, { conversationId: 20 }))).toBe(
      'CONVERSATION_ACCESS_DENIED'
    );
  });

  it('fails closed when the authorizer errors', async () => {
    const { chat } = setup({
      name: 'broken',
      canAccess: () => Promise.reject(new Error('laravel down')),
    });
    expect(await errorCode(chat.joinConversation(session(25), { conversationId: 10 }))).toBe(
      'INTERNAL_ERROR'
    );
  });

  it.each([
    [{ conversationId: '10' }],
    [{ conversationId: -1 }],
    [{ conversationId: 1.5 }],
    [{}],
    [null],
    ['10'],
  ])('rejects invalid conversation references: %j', async (payload) => {
    const { chat } = setup();
    expect(await errorCode(chat.joinConversation(session(25), payload))).toBe('INVALID_PAYLOAD');
  });

  it('broadcasts with the authenticated sender, ignoring client senderId', async () => {
    const { chat, emitter, persistence } = setup();
    const user25 = session(25);
    await chat.joinConversation(user25, { conversationId: 10 });

    const message = await chat.sendMessage(user25, {
      conversationId: 10,
      senderId: 999,
      message: '  Hello  ',
    });

    expect(message).toEqual({
      id: 'msg_1',
      conversationId: 10,
      senderId: 25,
      message: 'Hello',
      createdAt: '2026-11-26T10:00:00.000Z',
    });
    expect(persistence.saved).toEqual([{ conversationId: 10, senderId: 25, message: 'Hello' }]);
    expect(emitter.emitted).toEqual([
      {
        target: 'conversation:10',
        event: 'chat:message',
        payload: message,
        exceptSocketId: undefined,
      },
    ]);
  });

  it('validates messages', async () => {
    const { chat } = setup();
    const user25 = session(25);
    await chat.joinConversation(user25, { conversationId: 10 });
    expect(await errorCode(chat.sendMessage(user25, { conversationId: 10, message: '   ' }))).toBe(
      'INVALID_PAYLOAD'
    );
    expect(await errorCode(chat.sendMessage(user25, { conversationId: 10 }))).toBe(
      'INVALID_PAYLOAD'
    );
    expect(await errorCode(chat.sendMessage(user25, { conversationId: 10, message: 5 }))).toBe(
      'INVALID_PAYLOAD'
    );
    expect(
      await errorCode(chat.sendMessage(user25, { conversationId: 10, message: 'x'.repeat(101) }))
    ).toBe('MESSAGE_TOO_LARGE');
  });

  it('requires joining before sending or typing', async () => {
    const { chat } = setup();
    expect(
      await errorCode(chat.sendMessage(session(25), { conversationId: 10, message: 'hi' }))
    ).toBe('NOT_IN_CONVERSATION');
    expect(await errorCode(() => chat.setTyping(session(25), { conversationId: 10 }, true))).toBe(
      'NOT_IN_CONVERSATION'
    );
  });

  it('does not broadcast when persistence fails', async () => {
    const { chat, emitter, persistence } = setup();
    const user25 = session(25);
    await chat.joinConversation(user25, { conversationId: 10 });
    persistence.failNext = true;
    expect(await errorCode(chat.sendMessage(user25, { conversationId: 10, message: 'hi' }))).toBe(
      'MESSAGE_PERSISTENCE_FAILED'
    );
    expect(emitter.emitted).toHaveLength(0);
  });

  it('emits typing to the conversation, excluding the sending socket', async () => {
    const { chat, emitter } = setup();
    const user25 = session(25, 'sock-a');
    await chat.joinConversation(user25, { conversationId: 10 });
    chat.setTyping(user25, { conversationId: 10, userId: 999 }, true);
    chat.setTyping(user25, { conversationId: 10 }, false);
    expect(emitter.emitted).toEqual([
      {
        target: 'conversation:10',
        event: 'typing:start',
        payload: { conversationId: 10, userId: 25 },
        exceptSocketId: 'sock-a',
      },
      {
        target: 'conversation:10',
        event: 'typing:stop',
        payload: { conversationId: 10, userId: 25 },
        exceptSocketId: 'sock-a',
      },
    ]);
  });

  it('clears typing indicators when a socket disconnects', async () => {
    const { chat, emitter } = setup();
    const user25 = session(25);
    await chat.joinConversation(user25, { conversationId: 10 });
    chat.handleDisconnecting(user25);
    expect(emitter.emitted.map((e) => [e.target, e.event])).toEqual([
      ['conversation:10', 'typing:stop'],
    ]);
  });

  it('ships safe default adapters', async () => {
    expect(await new DenyAllConversationAuthorizer().canAccess()).toBe(false);
    expect(await new AllowAllDevConversationAuthorizer().canAccess()).toBe(true);
    const persisted = await new RealtimeOnlyMessagePersistence(
      () => new Date('2026-11-26T10:00:00Z')
    ).persist();
    expect(persisted).toEqual({ createdAt: '2026-11-26T10:00:00.000Z' });
  });
});
