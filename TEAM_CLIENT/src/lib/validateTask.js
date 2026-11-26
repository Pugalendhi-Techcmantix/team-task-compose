import { STATUS_OPTIONS, TASK_STATUS } from './taskStatus'

export { STATUS_OPTIONS }

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const EMPTY_TASK = { title: '', description: '', status: TASK_STATUS.TODO, priority: 'medium', due_date: '', assigned_to: '' }

const isValidDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Client-side mirror of the Laravel rules. Returns { field: message }. */
export function validateTask(input) {
  const errors = {}
  const title = (input.title ?? '').trim()

  if (!title) errors.title = 'Title is required.'
  else if (title.length > 255) errors.title = 'Title must be 255 characters or fewer.'

  if ((input.description ?? '').length > 5000) errors.description = 'Description is too long.'

  if (!STATUS_OPTIONS.some((o) => o.value === input.status)) errors.status = 'Choose a status.'
  if (!PRIORITY_OPTIONS.some((o) => o.value === input.priority)) errors.priority = 'Choose a priority.'

  if (input.due_date && !isValidDate(input.due_date)) errors.due_date = 'Enter a valid date.'

  return errors
}
