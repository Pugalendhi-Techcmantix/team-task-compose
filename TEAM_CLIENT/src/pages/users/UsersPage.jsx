import { useState } from 'react'
import { motion } from 'framer-motion'
import { usersApi } from '../../api/access'
import { getErrorMessage } from '../../api/errors'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { useFetch } from '../../hooks/useFetch'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { initials } from '../../lib/format'
import { collectRoles, humanize, rolesOf } from '../../lib/roles'
import { Page } from '../../components/layout/AppLayout'
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from '../../components/ui/States'
import Pagination from '../../components/ui/Pagination'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import RoleChips from '../../components/access/RoleChips'
import { EditLink, DeleteButton, PrimaryLink } from '../../components/access/RowActions'

const PER_PAGE = 10
const SPRING = { type: 'spring', stiffness: 280, damping: 26 }

export default function UsersPage() {
  const { user: me } = useAuth()
  const { notify } = useNotifications()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const q = useDebouncedValue(search.trim(), 300)

  const users = useFetch(
    () => usersApi.list({ page, per_page: PER_PAGE, ...(q && { search: q }), ...(role && { role_id: role }) }),
    [page, q, role],
  )

  // Filter options come from the users list (each user has role_id + role): no /roles call.
  const [roleOptions, setRoleOptions] = useState([])
  const [seenData, setSeenData] = useState(null)
  if (users.data && users.data !== seenData) {
    setSeenData(users.data)
    setRoleOptions((known) => collectRoles(known, users.data.items))
  }

  const onSearch = (v) => {
    setSearch(v)
    setPage(1)
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await usersApi.remove(toDelete.id)
      notify(`${toDelete.name} was deleted`, { tone: 'success' })
      setToDelete(null)
      if (users.data?.items.length === 1 && page > 1) setPage((p) => p - 1)
      else users.reload()
    } catch (err) {
      notify(`User not deleted. ${getErrorMessage(err)}`, { tone: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const items = users.data?.items ?? []
  const meta = users.data?.meta
  const filtered = Boolean(q || role)
  const total = meta?.total ?? items.length

  return (
    <Page wide>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <header className="mb-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-4 text-xs font-bold tracking-[0.18em] text-ink-soft uppercase">Access directory</p>
            <h1 className="max-w-5xl text-[clamp(2.35rem,4.2vw,4.5rem)] leading-[0.92] font-extrabold tracking-[-0.055em] text-balance">
              People behind <span className="text-st-done">the work.</span>
            </h1>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-4 lg:items-end lg:pb-2 lg:text-right">
            <p className="leading-relaxed text-ink-soft">Find teammates, shape their access, and keep every role accountable.</p>
            <PrimaryLink to="/users/new">Add teammate</PrimaryLink>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-12" aria-label="User overview">
          <motion.article whileHover={{ y: -4 }} transition={SPRING} className="flex min-h-44 flex-col justify-between overflow-hidden rounded-[1.75rem] bg-ink p-6 text-white md:col-span-2 xl:col-span-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-[0.16em] text-white/55 uppercase">People with access</span>
              <span className="size-2.5 rounded-full bg-signal shadow-[0_0_0_6px_rgba(185,232,75,0.12)]" />
            </div>
            <div className="flex items-end justify-between gap-6">
              <span className="text-[clamp(4rem,7vw,6.5rem)] leading-[0.72] font-extrabold tracking-[-0.085em] tabular-nums">{users.data ? total : '—'}</span>
              <p className="max-w-52 text-right text-sm leading-relaxed text-white/55">One shared workspace. Clear ownership.</p>
            </div>
          </motion.article>

          <motion.article whileHover={{ y: -4, rotate: -0.3 }} transition={SPRING} className="flex min-h-44 flex-col justify-between rounded-[1.75rem] bg-signal p-6 xl:col-span-3">
            <span className="text-sm font-bold">Roles represented</span>
            <div>
              <span className="text-6xl leading-none font-extrabold tracking-[-0.08em] tabular-nums">{roleOptions.length}</span>
              <p className="mt-3 text-sm text-ink/60">Across the people currently in view.</p>
            </div>
          </motion.article>

          <motion.article whileHover={{ y: -4 }} transition={SPRING} className="flex min-h-44 flex-col justify-between rounded-[1.75rem] border border-line bg-surface p-6 xl:col-span-3">
            <span className="text-xs font-bold tracking-[0.16em] text-ink-faint uppercase">Your seat</span>
            <div>
              <span className="grid size-12 place-items-center rounded-full bg-ink text-sm font-extrabold text-white" aria-hidden="true">{initials(me?.name)}</span>
              <p className="mt-3 truncate font-bold">{me?.name}</p>
              <p className="truncate text-sm text-ink-soft">{me?.email}</p>
            </div>
          </motion.article>
        </section>

        <section className="mt-3 rounded-[1.75rem] border border-line bg-surface p-4 sm:p-6" aria-labelledby="people-list-title">
          <div className="flex flex-col gap-5 border-b border-line-soft pb-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-ink-faint uppercase">Team roster</p>
              <h2 id="people-list-title" className="mt-1 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">
                {filtered ? `${total} matching ${total === 1 ? 'person' : 'people'}` : 'Everyone with access'}
              </h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row xl:w-[34rem]">
              <label className="relative block flex-1">
                <span className="sr-only">Search users</span>
                <svg viewBox="0 0 20 20" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Search name or email"
                  className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm placeholder:text-ink-faint focus:ring-2 focus:ring-ink/15 focus:outline-none"
                />
              </label>
              <label className="block sm:w-48">
                <span className="sr-only">Filter by role</span>
                <select
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value)
                    setPage(1)
                  }}
                  className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:ring-2 focus:ring-ink/15 focus:outline-none"
                >
                  <option value="">All roles</option>
                  {roleOptions.map((r) => (
                    <option key={r.id} value={String(r.id)}>{humanize(r.name)}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6">
        {users.status === 'loading' && !users.data ? (
          <LoadingState label="Loading users" />
        ) : users.status === 'error' ? (
          users.errorStatus === 403 ? <ForbiddenState /> : <ErrorState title="Users couldn't be loaded" message={users.error} onRetry={users.reload} />
        ) : items.length === 0 ? (
          filtered ? (
            <EmptyState title="No users match" message="Try another name, email or role." />
          ) : (
            <EmptyState title="No users yet" message="Add the people on your team." />
          )
        ) : (
          <>
            <motion.ul layout className="grid gap-2.5" aria-label="Users">
              {items.map((u) => {
                const isMe = String(u.id) === String(me?.id)
                return (
                  <motion.li
                    layout
                    key={u.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ x: 4 }}
                    transition={SPRING}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-[border-color,box-shadow] hover:border-ink/20 hover:shadow-[0_10px_28px_rgba(23,32,25,0.06)] sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:gap-5 sm:px-5"
                  >
                    <div className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ${isMe ? 'bg-signal text-ink' : 'bg-ink text-white'}`} aria-hidden="true">
                        {initials(u.name)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold">
                          {u.name} {isMe && <span className="ml-1 rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-bold tracking-wide text-st-done uppercase">You</span>}
                        </p>
                        <p className="truncate text-sm text-ink-soft">{u.email}</p>
                      </div>
                    </div>
                    <div className="min-w-0 pl-13 sm:pl-0">
                      <RoleChips roles={rolesOf(u)} />
                    </div>
                    <div className="flex items-center justify-self-end">
                      <EditLink to={`/users/${u.id}/edit`} label={`Edit ${u.name}`} />
                      <DeleteButton
                        label={isMe ? "You can't delete yourself" : `Delete ${u.name}`}
                        disabled={isMe}
                        onClick={() => setToDelete(u)}
                      />
                    </div>
                  </motion.li>
                )
              })}
            </motion.ul>
            <Pagination meta={meta} onPage={setPage} label="users" />
          </>
        )}
          </div>
        </section>
      </motion.div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this user?"
        confirmLabel="Delete user"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      >
        <span className="font-semibold text-ink">{toDelete?.name}</span> ({toDelete?.email}) will lose access immediately.
        Their tasks stay. This can't be undone.
      </ConfirmDialog>
    </Page>
  )
}
