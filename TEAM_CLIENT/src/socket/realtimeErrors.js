/** User-facing text for the Node.js service's error codes (contract §6). */
export const REALTIME_ERROR_MESSAGES = Object.freeze({
  CONVERSATION_ACCESS_DENIED: "You're not a member of this conversation",
  MESSAGE_TOO_LARGE: 'Message too long (max 2000)',
  RATE_LIMITED: 'Slow down',
  MESSAGE_PERSISTENCE_FAILED: 'Not sent, try again',
  NOT_IN_CONVERSATION: 'Reconnecting to the conversation, try again',
  TIMEOUT: 'The chat server did not answer. Try again.',
})

export const MAX_MESSAGE_LENGTH = 2000

export const realtimeErrorMessage = (code, fallback = 'Something went wrong. Try again.') =>
  REALTIME_ERROR_MESSAGES[code] ?? fallback

/**
 * Error code from an acknowledgement, or null when it succeeded.
 * Accepts { ok: true }, { ok: false, code }, { ok: false, error: { code } } and a bare code string.
 */
export function ackErrorCode(reply) {
  if (reply?.ok === true) return null
  if (typeof reply === 'string') return reply
  return reply?.error?.code ?? reply?.code ?? 'UNKNOWN'
}

/** Error thrown by chat actions; `.code` is the server code, `.message` is user-facing. */
export class RealtimeError extends Error {
  constructor(code, serverMessage) {
    super(realtimeErrorMessage(code, serverMessage))
    this.name = 'RealtimeError'
    this.code = code
  }
}
