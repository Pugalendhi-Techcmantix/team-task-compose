const STATUS_MESSAGES = {
  400: 'The request was not valid.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to do that.",
  404: 'That item no longer exists.',
  419: 'Your session has expired. Please refresh the page.',
  422: 'Please check the highlighted fields.',
  429: 'Too many requests. Please wait a moment and try again.',
}

/** Human-readable message for any error thrown by axios or our code. */
export function getErrorMessage(error) {
  if (!error) return 'Something went wrong.'

  if (error.isAxiosError) {
    const { response } = error
    if (!response) {
      return error.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Please try again.'
        : 'Cannot reach the server. Check your connection and try again.'
    }
    // TaskFlow v1: { error: { code, message, details } } · Laravel default: { message, errors }
    const data = typeof response.data === 'object' ? response.data : null
    const serverMessage = data?.error?.message ?? data?.message ?? null
    if (serverMessage) return serverMessage
    if (STATUS_MESSAGES[response.status]) return STATUS_MESSAGES[response.status]
    if (response.status >= 500) return 'Server error. Please try again shortly.'
  }

  return error.message || 'Something went wrong.'
}

/**
 * Field errors → { field: firstMsg }. Accepts the TaskFlow v1 shape
 * { error: { details: { field: [msg] } } } and Laravel's default { errors: { field: [msg] } }.
 */
export function getFieldErrors(error) {
  const data = error?.response?.data
  const errors = data?.error?.details ?? data?.errors
  if (!errors || typeof errors !== 'object') return {}
  return Object.fromEntries(
    Object.entries(errors).map(([field, msgs]) => [field, Array.isArray(msgs) ? msgs[0] : String(msgs)]),
  )
}
