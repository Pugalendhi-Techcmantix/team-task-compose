/**
 * Task statuses: the single source for values (sent to / received from the API),
 * labels and colours. Order = workflow order.
 */
export const TASK_STATUS = Object.freeze({ TODO: 'todo', IN_PROGRESS: 'in_progress', DONE: 'done' })

export const STATUS_OPTIONS = [
  { value: TASK_STATUS.TODO, label: 'Todo' },
  { value: TASK_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: TASK_STATUS.DONE, label: 'Done' },
]

/** Tailwind classes per status (tokens in src/index.css). */
export const STATUS_STYLE = {
  [TASK_STATUS.TODO]: { dot: 'bg-st-todo', text: 'text-st-todo' },
  [TASK_STATUS.IN_PROGRESS]: { dot: 'bg-st-progress', text: 'text-st-progress' },
  [TASK_STATUS.DONE]: { dot: 'bg-st-done', text: 'text-st-done' },
}

export const isDone = (status) => status === TASK_STATUS.DONE

/** Label for a status value; unknown values are shown as-is so a backend mismatch is visible. */
export const statusLabel = (status) => STATUS_OPTIONS.find((o) => o.value === status)?.label ?? String(status ?? '')

/** { all, todo, in_progress, done } counts for the dashboard tabs. */
export function countByStatus(tasks = []) {
  const c = { all: tasks.length }
  for (const o of STATUS_OPTIONS) c[o.value] = 0
  for (const t of tasks) if (c[t.status] !== undefined) c[t.status] += 1
  return c
}
