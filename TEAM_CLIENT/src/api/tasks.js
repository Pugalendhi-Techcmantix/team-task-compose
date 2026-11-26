import { api, unwrap } from './client'

/** '' → null (unassigned), '7' → 7. Omitted when the form didn't send it, so nothing is unassigned by accident. */
const toAssignee = (value) => (value === '' || value === null ? null : Number(value))

const toPayload = (input) => ({
  title: input.title?.trim(),
  description: input.description?.trim() || null,
  status: input.status,
  priority: input.priority,
  due_date: input.due_date || null,
  // Laravel notifies the assignee (task.assigned → Node → their bell).
  ...('assigned_to' in input && input.assigned_to !== undefined ? { assigned_to: toAssignee(input.assigned_to) } : {}),
})

export const tasksApi = {
  /** @returns {Promise<Task[]>} */
  async list(params = {}) {
    const data = unwrap(await api.get('/tasks', { params }))
    return Array.isArray(data) ? data : []
  },

  async get(id) {
    return unwrap(await api.get(`/tasks/${id}`))
  },

  async create(input) {
    return unwrap(await api.post('/tasks', toPayload(input)))
  },

  async update(id, input) {
    return unwrap(await api.put(`/tasks/${id}`, toPayload(input)))
  },

  /** Partial update (e.g. quick status change). */
  async patch(id, fields) {
    return unwrap(await api.put(`/tasks/${id}`, fields))
  },

  async remove(id) {
    await api.delete(`/tasks/${id}`)
  },
}
