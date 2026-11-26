const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mirrors the backend rules. `isNew` makes the password required. */
export function validateUser(v, { isNew }) {
  const e = {}
  if (!v.name?.trim()) e.name = 'Enter a name.'
  else if (v.name.trim().length > 255) e.name = 'Name must be 255 characters or fewer.'

  if (!EMAIL_RE.test(v.email?.trim() ?? '')) e.email = 'Enter a valid email address.'

  if (v.role_id === '' || v.role_id == null) e.role_id = 'Choose a role.'

  const wantsPassword = isNew || Boolean(v.password)
  if (wantsPassword) {
    if (!v.password) e.password = 'Enter a password.'
    else if (v.password.length < 8) e.password = 'Use at least 8 characters.'
    else if (v.password !== v.password_confirmation) e.password_confirmation = "Passwords don't match."
  }
  return e
}

export function validateRole(v) {
  const e = {}
  const name = v.name?.trim() ?? ''
  if (!name) e.name = 'Enter a role name.'
  else if (name.length > 100) e.name = 'Role name must be 100 characters or fewer.'
  if ((v.description ?? '').length > 500) e.description = 'Description is too long.'
  return e
}
