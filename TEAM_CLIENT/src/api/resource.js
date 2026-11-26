import { api, unwrap, unwrapPage } from './client'

/**
 * Standard REST resource under VITE_API_BASE_URL.
 * `toPayload` shapes form values into the request body.
 */
export function createResource(path, toPayload = (v) => v) {
  return {
    /** @returns {Promise<{ items: any[], meta: null | { page, lastPage, perPage, total } }>} */
    async list(params = {}) {
      return unwrapPage(await api.get(path, { params }))
    },
    async get(id) {
      return unwrap(await api.get(`${path}/${id}`))
    },
    async create(values) {
      return unwrap(await api.post(path, toPayload(values)))
    },
    async update(id, values) {
      return unwrap(await api.put(`${path}/${id}`, toPayload(values)))
    },
    async remove(id) {
      await api.delete(`${path}/${id}`)
    },
  }
}

