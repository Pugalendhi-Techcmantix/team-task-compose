import { api, unwrap } from './client'

const toPayload = (input) => ({
  title: input.title?.trim(),
  description: input.description?.trim() || null,
  status: input.status,
  priority: input.priority,
  due_date: input.due_date || null,
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
