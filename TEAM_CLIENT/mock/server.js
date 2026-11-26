/**
 * DEV-ONLY mock of the TaskFlow backend contract (PLAN.md §3).
 * Laravel REST API + Node.js Socket.IO service in one in-memory process.
 * Not shipped in the Docker image.
 *
 *   npm run mock                 → http://localhost:8000
 *   MOCK_SIMULATE=1 npm run mock → a "teammate" changes a task every 15 s
 *
 * Demo login: demo@taskflow.dev / password
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import express from 'express'
import { Server } from 'socket.io'

const PORT = Number(process.env.MOCK_PORT || 8000)
const STATUSES = ['todo', 'in_progress', 'done']
const PRIORITIES = ['low', 'medium', 'high']

// ---------- in-memory data ----------
const tokens = new Map() // token -> userId
const stamp = () => new Date().toISOString()

// ---- roles master (no permissions) ----
let nextRoleId = 1
const roles = [
  { name: 'admin', description: 'Manages users and roles.' },
  { name: 'manager', description: 'Runs the board and sees the team.' },
  { name: 'member', description: 'Works on tasks.' },
].map((r) => ({ id: nextRoleId++, ...r }))

let nextUserId = 1
const users = [
  { name: 'Demo User', email: 'demo@taskflow.dev', role_id: 1 },
  { name: 'Sam Rivera', email: 'sam@taskflow.dev', role_id: 2 },
  { name: 'Priya Nair', email: 'priya@taskflow.dev', role_id: 3 },
  { name: 'Alex Chen', email: 'alex@taskflow.dev', role_id: 3 },
  ...['Jordan Lee', 'Mia Torres', 'Noah Kim', 'Ava Patel', 'Liam Brooks', 'Zoe Martin', 'Ethan Wu', 'Grace Ali'].map((name) => ({
    name,
    email: `${name.split(' ')[0].toLowerCase()}@taskflow.dev`,
    role_id: 3,
  })),
].map((u) => ({ id: nextUserId++, password: 'password', created_at: stamp(), ...u }))

const roleOut = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description ?? null,
  users_count: users.filter((u) => u.role_id === r.id).length,
})
const roleRef = (id) => {
  const r = roles.find((x) => x.id === id)
  return r ? { id: r.id, name: r.name, slug: r.name.replace(/-/g, '_') } : null
}
let nextTaskId = 1
const now = () => new Date().toISOString()
const isoDay = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

const tasks = [
  { title: 'Set up Laravel Sanctum auth', status: 'done', priority: 'high', due_date: isoDay(-2) },
  { title: 'Publish task.created to Redis', description: 'Laravel event → Redis channel "tasks".', status: 'in_progress', priority: 'high', due_date: isoDay(0) },
  { title: 'Write nginx.conf for /api and /socket.io', status: 'in_progress', priority: 'medium', due_date: isoDay(1) },
  { title: 'Docker compose: wire Postgres volume', status: 'todo', priority: 'medium', due_date: isoDay(5) },
  { title: 'End-to-end test: create task shows on second tab', status: 'todo', priority: 'low', due_date: null },
].map((t) => ({ id: nextTaskId++, description: null, user_id: 1, created_at: now(), updated_at: now(), ...t }))

/** User as the users API returns it: roles as { id, name }. */
const publicUser = ({ password: _pw, ...u }) => ({ ...u, role: roleRef(u.role_id) })
/** /auth/me and login: role names. */
const meUser = (u) => ({ id: u.id, name: u.name, email: u.email, role_id: u.role_id, role: roleRef(u.role_id) })

// ---------- http ----------
const app = express()
app.use(express.json())
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`)
  next()
})

const api = express.Router()

const validationError = (res, errors) =>
  res.status(422).json({ error: { code: 'validation_error', message: 'The given data was invalid.', details: errors } })

const issueToken = (userId) => {
  const token = `${userId}|${randomBytes(24).toString('hex')}`
  tokens.set(token, userId)
  return token
}

// ---- Sanctum SPA cookie auth (VITE_AUTH_MODE=cookie) ----
const SESSION_COOKIE = 'taskflow-session'
const sessions = new Map() // session id -> userId

const parseCookies = (header = '') =>
  Object.fromEntries(
    header.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const i = p.indexOf('=')
      return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]
    }),
  )

const setCookie = (res, name, value, { httpOnly = false, maxAge = 7200 } = {}) =>
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}`)

// Same headers as the real backend: XSRF-TOKEN readable by JS, session HttpOnly.
app.get('/sanctum/csrf-cookie', (_req, res) => {
  setCookie(res, 'XSRF-TOKEN', randomBytes(20).toString('hex'))
  res.status(204).end()
})

/** Cookie requests that change data must echo the XSRF-TOKEN cookie in X-XSRF-TOKEN (Laravel → 419). */
const csrfOk = (req) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true
  const xsrf = parseCookies(req.get('cookie'))['XSRF-TOKEN']
  return Boolean(xsrf) && req.get('x-xsrf-token') === xsrf
}
const csrfMismatch = (res) => res.status(419).json({ error: { code: 'csrf_mismatch', message: 'CSRF token mismatch.' } })

const auth = (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '')
  const sessionId = parseCookies(req.get('cookie'))[SESSION_COOKIE]
  let userId = token && tokens.get(token)
  if (!userId && sessionId && sessions.has(sessionId)) {
    if (!csrfOk(req)) return csrfMismatch(res)
    userId = sessions.get(sessionId)
    req.sessionId = sessionId
  }
  if (!userId) return res.status(401).json({ error: { code: 'unauthenticated', message: 'Authentication is required. Provide a valid Bearer token.' } })
  req.user = users.find((u) => u.id === userId)
  req.token = token
  next()
}

/** A request that fetched /sanctum/csrf-cookie first is a "stateful" SPA request. */
const isStateful = (req) => Boolean(parseCookies(req.get('cookie'))['XSRF-TOKEN'])

const startCookieSession = (res, userId) => {
  const id = randomBytes(24).toString('hex')
  sessions.set(id, userId)
  setCookie(res, SESSION_COOKIE, id, { httpOnly: true })
}

api.post('/auth/register', (req, res) => {
  const { name = '', email = '', password = '', password_confirmation } = req.body ?? {}
  const errors = {}
  if (!name.trim()) errors.name = ['The name field is required.']
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ['The email field must be a valid email address.']
  else if (users.some((u) => u.email === email.toLowerCase())) errors.email = ['The email has already been taken.']
  if (password.length < 8) errors.password = ['The password field must be at least 8 characters.']
  else if (password !== password_confirmation) errors.password = ['The password field confirmation does not match.']
  if (Object.keys(errors).length) return validationError(res, errors)

  const user = { id: nextUserId++, name: name.trim(), email: email.toLowerCase(), password, role_id: 3, created_at: stamp() }
  users.push(user)
  if (isStateful(req)) {
    startCookieSession(res, user.id)
    return res.status(201).json({ user: meUser(user), token: issueToken(user.id) })
  }
  res.status(201).json({ user: meUser(user), token: issueToken(user.id) })
})

api.post('/auth/login', (req, res) => {
  if (isStateful(req) && !csrfOk(req)) return csrfMismatch(res)
  const { email = '', password = '' } = req.body ?? {}
  const user = users.find((u) => u.email === email.toLowerCase() && u.password === password)
  if (!user) return res.status(401).json({ error: { code: 'invalid_credentials', message: 'The email or password is incorrect.' } })
  if (isStateful(req)) {
    // Sanctum SPA login: session cookie (token also returned; cookie mode ignores it)
    startCookieSession(res, user.id)
    return res.json({ user: meUser(user), token: issueToken(user.id) })
  }
  res.json({ user: meUser(user), token: issueToken(user.id) })
})

api.post('/auth/logout', auth, (req, res) => {
  if (req.token) tokens.delete(req.token)
  if (req.sessionId) {
    sessions.delete(req.sessionId)
    setCookie(res, SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 })
  }
  res.status(204).end()
})

api.get('/auth/me', auth, (req, res) => res.json({ data: meUser(req.user) }))

// ---------- users + roles master ----------
const notFound = (res) => res.status(404).json({ error: { code: 'not_found', message: 'The requested resource was not found.' } })
const byId = (list, id) => list.find((x) => x.id === Number(id))
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// users
api.get('/users', auth, (req, res) => {
  const q = String(req.query.search ?? '').toLowerCase()
  const roleId = Number(req.query.role_id) || null
  const perPage = Math.min(Number(req.query.per_page) || 15, 100)
  const list = users.filter(
    (u) =>
      (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)) &&
      (!roleId || u.role_id === roleId),
  )
  const lastPage = Math.max(1, Math.ceil(list.length / perPage))
  const page = Math.min(Math.max(1, Number(req.query.page) || 1), lastPage)
  res.json({
    data: list.slice((page - 1) * perPage, page * perPage).map(publicUser),
    links: {},
    meta: { current_page: page, last_page: lastPage, per_page: perPage, total: list.length },
  })
})
api.get('/users/:id', auth, (req, res) => {
  const u = byId(users, req.params.id)
  return u ? res.json({ data: publicUser(u) }) : notFound(res)
})
const validateUserBody = (b, existing) => {
  const e = {}
  if (!String(b.name ?? '').trim()) e.name = ['The name field is required.']
  const email = String(b.email ?? '').toLowerCase().trim()
  if (!EMAIL.test(email)) e.email = ['The email field must be a valid email address.']
  else if (users.some((u) => u.email === email && u.id !== existing?.id)) e.email = ['The email has already been taken.']
  if (!existing || b.password) {
    if (String(b.password ?? '').length < 8) e.password = ['The password field must be at least 8 characters.']
    else if (b.password !== b.password_confirmation) e.password = ['The password field confirmation does not match.']
  }
  if (b.role_id == null || b.role_id === '') e.role_id = ['The role id field is required.']
  else if (!byId(roles, b.role_id)) e.role_id = ['The selected role id is invalid.']
  return e
}
api.post('/users', auth, (req, res) => {
  const e = validateUserBody(req.body ?? {})
  if (Object.keys(e).length) return validationError(res, e)
  const b = req.body
  const u = { id: nextUserId++, name: b.name.trim(), email: b.email.toLowerCase().trim(), password: b.password, role_id: Number(b.role_id), created_at: stamp() }
  users.push(u)
  res.status(201).json({ data: publicUser(u) })
})
api.put('/users/:id', auth, (req, res) => {
  const u = byId(users, req.params.id)
  if (!u) return notFound(res)
  const e = validateUserBody(req.body ?? {}, u)
  if (Object.keys(e).length) return validationError(res, e)
  const b = req.body
  Object.assign(u, { name: b.name.trim(), email: b.email.toLowerCase().trim() }, b.password ? { password: b.password } : {})
  u.role_id = Number(b.role_id)
  res.json({ data: publicUser(u) })
})
api.delete('/users/:id', auth, (req, res) => {
  const u = byId(users, req.params.id)
  if (!u) return notFound(res)
  if (u.id === req.user.id) return res.status(422).json({ error: { code: 'cannot_delete_self', message: 'You cannot delete your own account.' } })
  users.splice(users.indexOf(u), 1)
  res.status(204).end()
})

// roles
api.get('/roles', auth, (_req, res) => res.json({ data: roles.map(roleOut) }))
api.get('/roles/:id', auth, (req, res) => {
  const r = byId(roles, req.params.id)
  return r ? res.json({ data: roleOut(r) }) : notFound(res)
})
const validateRoleBody = (b, existing) => {
  const e = {}
  const name = String(b.name ?? '').trim()
  if (!name) e.name = ['The name field is required.']
  else if (roles.some((r) => r.name === name && r.id !== existing?.id)) e.name = ['The name has already been taken.']
  return e
}
api.post('/roles', auth, (req, res) => {
  const e = validateRoleBody(req.body ?? {})
  if (Object.keys(e).length) return validationError(res, e)
  const r = { id: nextRoleId++, name: req.body.name.trim(), description: req.body.description ?? null }
  roles.push(r)
  res.status(201).json({ data: roleOut(r) })
})
api.put('/roles/:id', auth, (req, res) => {
  const r = byId(roles, req.params.id)
  if (!r) return notFound(res)
  const b = req.body ?? {}
  const e = validateRoleBody(b, r)
  if (Object.keys(e).length) return validationError(res, e)
  Object.assign(r, { name: b.name.trim(), description: b.description ?? null })
  res.json({ data: roleOut(r) })
})
api.delete('/roles/:id', auth, (req, res) => {
  const r = byId(roles, req.params.id)
  if (!r) return notFound(res)
  roles.splice(roles.indexOf(r), 1)
  res.status(204).end()
})

const validateTask = (body, partial) => {
  const errors = {}
  if (!partial || 'title' in body) {
    if (!body.title || !String(body.title).trim()) errors.title = ['The title field is required.']
    else if (String(body.title).length > 255) errors.title = ['The title field must not be greater than 255 characters.']
  }
  if ((!partial || 'status' in body) && !STATUSES.includes(body.status)) errors.status = ['The selected status is invalid.']
  if ((!partial || 'priority' in body) && !PRIORITIES.includes(body.priority)) errors.priority = ['The selected priority is invalid.']
  return errors
}

api.get('/tasks', auth, (req, res) => {
  const { status } = req.query
  const list = [...tasks].reverse().filter((t) => !status || t.status === status)
  res.json({ data: list })
})

// ---------- realtime token for the Socket.IO service (15 min, never stored by the client) ----------
const REALTIME_TTL_MS = Number(process.env.MOCK_REALTIME_TTL_MS) || 15 * 60 * 1000 // set low to test token expiry
const realtimeTokens = new Map() // token -> { userId, exp }
api.get('/tasks/:id', auth, (req, res) => {
  const task = tasks.find((t) => t.id === Number(req.params.id))
  return task ? res.json({ data: task }) : res.status(404).json({ error: { code: 'not_found', message: 'The requested resource was not found.' } })
})
api.post('/realtime/token', auth, (req, res) => {
  const token = `rt_${randomBytes(24).toString('hex')}`
  const exp = Date.now() + REALTIME_TTL_MS
  realtimeTokens.set(token, { userId: req.user.id, exp })
  res.json({ data: { token, expires_at: new Date(exp).toISOString() } })
})

let nextNotificationId = 1
/** Same shape as the real Node service: { id, type, title, message, taskId, createdAt } */
const notifyAll = (type, title, task) =>
  io.emit('notification', { id: nextNotificationId++, type, title, message: task.title, taskId: task.id, createdAt: now() })

api.post('/tasks', auth, (req, res) => {
  const errors = validateTask(req.body ?? {}, false)
  if (Object.keys(errors).length) return validationError(res, errors)
  const { title, description = null, status, priority, due_date = null } = req.body
  const task = { id: nextTaskId++, title: title.trim(), description, status, priority, due_date, user_id: req.user.id, created_at: now(), updated_at: now() }
  tasks.push(task)
  notifyAll('task.created', 'New task', task)
  res.status(201).json({ data: task })
})

api.put('/tasks/:id', auth, (req, res) => {
  const task = tasks.find((t) => t.id === Number(req.params.id))
  if (!task) return res.status(404).json({ error: { code: 'not_found', message: 'The requested resource was not found.' } })
  const body = req.body ?? {}
  const errors = validateTask(body, true)
  if (Object.keys(errors).length) return validationError(res, errors)
  for (const f of ['title', 'description', 'status', 'priority', 'due_date']) if (f in body) task[f] = body[f]
  task.updated_at = now()
  notifyAll('task.updated', 'Task updated', task)
  res.json({ data: task })
})

api.delete('/tasks/:id', auth, (req, res) => {
  const i = tasks.findIndex((t) => t.id === Number(req.params.id))
  if (i === -1) return res.status(404).json({ error: { code: 'not_found', message: 'The requested resource was not found.' } })
  const [task] = tasks.splice(i, 1)
  notifyAll('task.deleted', 'Task deleted', task)
  res.status(204).end()
})

// ---------- chat (PROPOSED Laravel contract, PLAN.md Phase 3) ----------
const MAX_MESSAGE = 2000
let nextConversationId = 1
let nextMessageId = 1
const conversations = [
  { name: 'General', everyone: true, memberIds: [] }, // everyone, incl. newly registered users
  { name: 'Managers', memberIds: [2] }, // demo (user 1) is NOT a member → access denied test
  { name: null, memberIds: [1, 3] }, // direct: Demo ↔ Priya
].map((c) => ({ id: nextConversationId++, updated_at: stamp(), ...c }))
const messages = []
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
;[
  [1, 3, 'Morning! Standup notes are in the doc.', 60 * 24 + 30],
  [1, 2, 'Thanks Priya. I moved the nginx task to In Progress.', 60 * 24 + 25],
  [1, 4, 'Postgres volume is wired, testing compose now.', 45],
  [1, 3, 'Nice. Ping me when the socket token flow is up.', 40],
  [3, 3, 'Can you review my PR before lunch?', 20],
].forEach(([conversation_id, sender_id, message, min]) =>
  messages.push({ id: nextMessageId++, conversation_id, sender_id, message, created_at: ago(min) }),
)

const memberIdsOf = (c) => (c.everyone ? users.map((u) => u.id) : c.memberIds)
const isMember = (c, userId) => Boolean(c) && memberIdsOf(c).includes(userId)
const messageOut = (m) => {
  const sender = users.find((u) => u.id === m.sender_id)
  return { ...m, sender: sender ? { id: sender.id, name: sender.name } : null }
}
const conversationOut = (c) => {
  const last = messages.filter((m) => m.conversation_id === c.id).at(-1)
  return {
    id: c.id,
    name: c.name,
    type: c.name === null && memberIdsOf(c).length === 2 ? 'direct' : 'group',
    members: memberIdsOf(c).map((id) => users.find((u) => u.id === id)).filter(Boolean).map((u) => ({ id: u.id, name: u.name })),
    last_message: last ? messageOut(last) : null,
    updated_at: last?.created_at ?? c.updated_at,
  }
}
const forbidden = (res) => res.status(403).json({ error: { code: 'forbidden', message: 'You are not a member of this conversation.' } })

api.get('/conversations', auth, (req, res) => {
  const list = conversations.filter((c) => isMember(c, req.user.id)).map(conversationOut)
  list.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
  res.json({ data: list })
})
api.get('/conversations/:id', auth, (req, res) => {
  const c = conversations.find((x) => x.id === Number(req.params.id))
  if (!c) return notFound(res)
  if (!isMember(c, req.user.id)) return forbidden(res)
  res.json({ data: conversationOut(c) })
})
api.post('/conversations', auth, (req, res) => {
  // like Laravel: type is required (direct | group)
  if (!req.body?.type) return validationError(res, { type: ['The type field is required.'] })
  if (!['direct', 'group'].includes(req.body.type)) return validationError(res, { type: ['The selected type is invalid.'] })
  // like Laravel: direct → user_id (required), group → user_ids
  const direct = req.body.type === 'direct'
  const field = direct ? 'user_id' : 'user_ids'
  if (direct && (req.body.user_id === undefined || req.body.user_id === null)) return validationError(res, { user_id: ['The user id field is required.'] })
  const ids = direct ? [Number(req.body.user_id)] : Array.isArray(req.body.user_ids) ? [...new Set(req.body.user_ids.map(Number))] : []
  const others = ids.filter((id) => id !== req.user.id)
  if (others.length === 0) return validationError(res, { [field]: ['Choose at least one person.'] })
  if (others.some((id) => !users.some((u) => u.id === id))) return validationError(res, { [field]: [`The selected ${field.replace('_', ' ')} is invalid.`] })
  const name = String(req.body?.name ?? '').trim() || null
  const memberIds = [req.user.id, ...others]
  if (!name && others.length === 1) {
    const existing = conversations.find(
      (c) => !c.everyone && c.name === null && c.memberIds.length === 2 && memberIds.every((id) => c.memberIds.includes(id)),
    )
    if (existing) return res.json({ data: conversationOut(existing) })
  }
  const c = { id: nextConversationId++, name, memberIds, updated_at: stamp() }
  conversations.push(c)
  res.status(201).json({ data: conversationOut(c) })
})
api.get('/conversations/:id/messages', auth, (req, res) => {
  const c = conversations.find((x) => x.id === Number(req.params.id))
  if (!c) return notFound(res)
  if (!isMember(c, req.user.id)) return forbidden(res)
  const limit = Math.min(Number(req.query.limit) || 30, 100)
  const before = Number(req.query.before) || Infinity
  const all = messages.filter((m) => m.conversation_id === c.id && m.id < before)
  res.json({ data: all.slice(-limit).map(messageOut), meta: { has_more: all.length > limit } })
})

app.use('/api/v1', api)
app.use((_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'The requested resource was not found.' } }))

// ---------- socket.io ----------
const server = createServer(app)
const io = new Server(server, { path: '/socket.io', cors: { origin: true } })

const socketError = (code, message) => Object.assign(new Error(message), { data: { code, message } })
io.use((socket, next) => {
  // Like the real Node service: auth.token must be a realtime token from POST /realtime/token
  const token = socket.handshake.auth?.token
  if (!token) return next(socketError('UNAUTHORIZED', 'Authentication required'))
  const entry = realtimeTokens.get(token)
  if (!entry) return next(socketError('INVALID_TOKEN', 'Invalid authentication token'))
  if (entry.exp < Date.now()) return next(socketError('TOKEN_EXPIRED', 'Token expired'))
  socket.data.userId = entry.userId
  // the server drops the socket when its token expires; the client reconnects with a new one
  const left = entry.exp - Date.now()
  if (left < 2 ** 31) setTimeout(() => socket.disconnect(true), left)
  next()
})

const openSockets = new Map() // userId → number of connected tabs
const sendRates = new Map() // socket.id → timestamps
const room = (id) => `conversation:${id}`
const reply = (ack, body) => typeof ack === 'function' && ack(body)
const fail = (ack, code, message) => reply(ack, { ok: false, error: { code, message } })

io.on('connection', (socket) => {
  const userId = socket.data.userId
  console.log(`socket connected user=${userId} id=${socket.id}`)
  openSockets.set(userId, (openSockets.get(userId) ?? 0) + 1)
  if (openSockets.get(userId) === 1) io.emit('presence:update', { userId, status: 'online', at: now() })

  socket.on('conversation:join', ({ conversationId } = {}, ack) => {
    const c = conversations.find((x) => x.id === Number(conversationId))
    if (!isMember(c, userId)) return fail(ack, 'CONVERSATION_ACCESS_DENIED', 'You are not a member of this conversation')
    socket.join(room(c.id))
    reply(ack, { ok: true })
  })
  socket.on('conversation:leave', ({ conversationId } = {}, ack) => {
    socket.leave(room(conversationId))
    reply(ack, { ok: true })
  })
  socket.on('chat:send', ({ conversationId, message } = {}, ack) => {
    if (!socket.rooms.has(room(conversationId))) return fail(ack, 'NOT_IN_CONVERSATION', 'Join the conversation first')
    const text = String(message ?? '').trim()
    if (!text || text.length > MAX_MESSAGE) return fail(ack, 'MESSAGE_TOO_LARGE', 'Message too long')
    const recent = (sendRates.get(socket.id) ?? []).filter((t) => Date.now() - t < 10_000)
    if (recent.length >= 20) return fail(ack, 'RATE_LIMITED', 'Slow down')
    sendRates.set(socket.id, [...recent, Date.now()])
    const saved = { id: nextMessageId++, conversation_id: Number(conversationId), sender_id: userId, message: text, created_at: now() }
    messages.push(saved)
    const payload = { id: saved.id, conversationId: saved.conversation_id, senderId: userId, message: text, createdAt: saved.created_at }
    io.to(room(conversationId)).emit('chat:message', payload) // includes the sender
    reply(ack, { ok: true, data: payload })
  })
  for (const event of ['typing:start', 'typing:stop']) {
    socket.on(event, ({ conversationId } = {}) => {
      if (socket.rooms.has(room(conversationId))) socket.to(room(conversationId)).emit(event, { conversationId: Number(conversationId), userId })
    })
  }

  socket.on('disconnect', () => {
    console.log(`socket disconnected id=${socket.id}`)
    sendRates.delete(socket.id)
    const left = (openSockets.get(userId) ?? 1) - 1
    if (left > 0) openSockets.set(userId, left)
    else {
      openSockets.delete(userId)
      io.emit('presence:update', { userId, status: 'offline', at: now() })
    }
  })
})

// ---------- optional teammate simulation ----------
if (process.env.MOCK_SIMULATE) {
  const ideas = ['Review PR #42', 'Update API docs', 'Rotate Redis password', 'Fix flaky socket test', 'Plan sprint demo']
  setInterval(() => {
    if (Math.random() < 0.6 || tasks.length === 0) {
      const task = {
        id: nextTaskId++, title: ideas[Math.floor(Math.random() * ideas.length)], description: null,
        status: 'todo', priority: PRIORITIES[Math.floor(Math.random() * 3)], due_date: isoDay(3),
        user_id: 99, created_at: now(), updated_at: now(),
      }
      tasks.push(task)
      notifyAll('task.created', 'New task', task)
    } else {
      const task = tasks[Math.floor(Math.random() * tasks.length)]
      task.status = STATUSES[(STATUSES.indexOf(task.status) + 1) % 3]
      task.updated_at = now()
      notifyAll('task.updated', 'Task updated', task)
    }
  }, 15_000)
}

server.listen(PORT, () => {
  console.log(`TaskFlow mock backend on http://localhost:${PORT}  (login: demo@taskflow.dev / password)`)
  console.log('REST /api/*  |  Socket.IO /socket.io')
})
