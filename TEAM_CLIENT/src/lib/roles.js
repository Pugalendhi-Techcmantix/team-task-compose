const nameOf = (x) => (typeof x === 'string' ? x : x?.name)

/** A user's roles as a list: user.roles (array) or the backend's single user.role ({ id, name, slug }). */
export const rolesOf = (user) => (Array.isArray(user?.roles) ? user.roles : user?.role ? [user.role] : [])

/**
 * Roles for the users filter, collected from the users list itself (each user carries
 * role_id + role). Merges into `known` so options don't disappear when a filter narrows
 * the list. Returns [{ id, name }] sorted by name; same array back when nothing is new.
 */
export function collectRoles(known, users = []) {
  const map = new Map(known.map((r) => [String(r.id), r]))
  let added = false
  for (const u of users) {
    for (const r of rolesOf(u)) {
      if (r && typeof r === 'object' && r.id != null && !map.has(String(r.id))) {
        map.set(String(r.id), { id: r.id, name: r.name })
        added = true
      }
    }
  }
  return added ? [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))) : known
}

/** Role names (strings or { name } objects). */
export const roleNames = (user) => rolesOf(user).map(nameOf).filter(Boolean)

/** Human label: "team-lead" / "in_progress" → "Team lead" / "In progress". */
export const humanize = (s = '') => {
  const t = s.replace(/[._-]+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}
