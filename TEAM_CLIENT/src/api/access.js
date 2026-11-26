import { createResource } from './resource'

/** User body as the backend expects it: one role per user (`role_id`). */
export function toUserPayload(v) {
  const body = { name: v.name.trim(), email: v.email.trim(), role_id: v.role_id === '' || v.role_id == null ? null : Number(v.role_id) }
  if (v.password) {
    body.password = v.password
    body.password_confirmation = v.password_confirmation
  }
  return body
}

export const usersApi = createResource('/users', toUserPayload)

/** Roles master: name + description only. */
export const rolesApi = createResource('/roles', (v) => ({
  name: v.name.trim(),
  description: v.description?.trim() || null,
}))
