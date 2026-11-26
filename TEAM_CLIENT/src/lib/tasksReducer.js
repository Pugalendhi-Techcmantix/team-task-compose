export const initialTasksState = { items: [], status: 'idle', error: null }

const sameId = (a, b) => String(a) === String(b)

/**
 * One reducer for REST results and socket events, so a task created here and
 * echoed back by Socket.IO is never shown twice.
 */
export function tasksReducer(state, action) {
  switch (action.type) {
    case 'loading':
      return { ...state, status: 'loading', error: null }

    case 'loaded':
      return { items: action.tasks ?? [], status: 'ready', error: null }

    case 'failed':
      return { ...state, status: 'error', error: action.error }

    case 'upsert': {
      const task = action.task
      if (!task || task.id === undefined || task.id === null) return state
      const exists = state.items.some((t) => sameId(t.id, task.id))
      const items = exists
        ? state.items.map((t) => (sameId(t.id, task.id) ? { ...t, ...task } : t))
        : [task, ...state.items]
      return { ...state, items }
    }

    case 'remove':
      return { ...state, items: state.items.filter((t) => !sameId(t.id, action.id)) }

    default:
      return state
  }
}
