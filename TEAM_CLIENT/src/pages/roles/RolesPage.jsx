import { useState } from 'react'
import { motion } from 'framer-motion'
import { rolesApi } from '../../api/access'
import { getErrorMessage } from '../../api/errors'
import { useNotifications } from '../../context/NotificationContext'
import { useFetch } from '../../hooks/useFetch'
import { humanize } from '../../lib/roles'
import { Page } from '../../components/layout/AppLayout'
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from '../../components/ui/States'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { DeleteButton, EditLink, PrimaryLink } from '../../components/access/RowActions'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const SPRING = { type: 'spring', stiffness: 280, damping: 26 }

export default function RolesPage() {
  const { notify } = useNotifications()
  const roles = useFetch(() => rolesApi.list(), [])
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const confirmDelete = async () => {
    setDeleting(true)
    try {
      await rolesApi.remove(toDelete.id)
      roles.setData((d) => ({ ...d, items: d.items.filter((r) => r.id !== toDelete.id) }))
      notify(`Role “${humanize(toDelete.name)}” was deleted`, { tone: 'success' })
      setToDelete(null)
    } catch (err) {
      notify(`Role not deleted. ${getErrorMessage(err)}`, { tone: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const items = roles.data?.items ?? []
  const assignedUsers = items.reduce((sum, role) => sum + (role.users_count ?? 0), 0)

  return (
    <Page wide>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}>
        <header className="mb-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-4 text-xs font-bold tracking-[0.18em] text-ink-soft uppercase">Access architecture</p>
            <h1 className="max-w-5xl text-[clamp(2.35rem,4.2vw,4.5rem)] leading-[0.92] font-extrabold tracking-[-0.055em] text-balance">
              Shape who can <span className="text-st-done">do what.</span>
            </h1>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-4 lg:items-end lg:pb-2 lg:text-right">
            <p className="leading-relaxed text-ink-soft">Keep access simple, legible, and built around how your team actually works.</p>
            <PrimaryLink to="/roles/new">Create a role</PrimaryLink>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-12" aria-label="Role overview">
          <motion.article whileHover={{ y: -4 }} transition={SPRING} className="dashboard-grid relative flex min-h-48 flex-col justify-between overflow-hidden rounded-[1.75rem] bg-ink p-6 text-white md:col-span-2 xl:col-span-8">
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-xs font-bold tracking-[0.16em] text-white/55 uppercase">Role system</span>
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/60">One role per user</span>
            </div>
            <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <p className="max-w-3xl text-[clamp(1.7rem,2.8vw,2.8rem)] leading-[1] font-bold tracking-[-0.045em] text-balance">Clear roles make fast teams safer.</p>
              <span className="shrink-0 text-6xl leading-none font-extrabold tracking-[-0.08em] text-signal tabular-nums">{roles.data ? items.length : '—'}</span>
            </div>
            <div className="absolute -right-14 -bottom-20 size-60 rounded-full border-[42px] border-signal/12" aria-hidden="true" />
          </motion.article>

          <motion.article whileHover={{ y: -4, rotate: -0.3 }} transition={SPRING} className="flex min-h-48 flex-col justify-between rounded-[1.75rem] bg-signal p-6 md:col-span-2 xl:col-span-4">
            <span className="text-sm font-bold">Assigned seats</span>
            <div>
              <span className="text-[clamp(4rem,7vw,6.5rem)] leading-[0.72] font-extrabold tracking-[-0.085em] tabular-nums">{roles.data ? assignedUsers : '—'}</span>
              <p className="mt-4 max-w-52 text-sm leading-relaxed text-ink/60">People connected to the roles below.</p>
            </div>
          </motion.article>
        </section>

        <section className="mt-3 rounded-[1.75rem] border border-line bg-surface p-4 sm:p-6" aria-labelledby="role-list-title">
          <div className="mb-6 border-b border-line-soft pb-6">
            <p className="text-xs font-bold tracking-[0.16em] text-ink-faint uppercase">Role library</p>
            <h2 id="role-list-title" className="mt-1 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">Built for this team</h2>
          </div>

        {roles.status === 'loading' ? (
          <LoadingState label="Loading roles" />
        ) : roles.status === 'error' ? (
          roles.errorStatus === 403 ? <ForbiddenState /> : <ErrorState title="Roles couldn't be loaded" message={roles.error} onRetry={roles.reload} />
        ) : items.length === 0 ? (
          <EmptyState title="No roles yet" message="Create a role, then give it to users." />
        ) : (
          <motion.ul layout className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Roles">
            {items.map((r, index) => {
              const userCount = r.users_count ?? null
              return (
                <motion.li
                  layout
                  key={r.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4 }}
                  transition={SPRING}
                  className="flex min-h-56 flex-col justify-between rounded-[1.5rem] border border-line bg-paper p-5 transition-[border-color,box-shadow] hover:border-ink/20 hover:shadow-[0_14px_32px_rgba(23,32,25,0.07)]"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold tracking-[0.16em] text-ink-faint">{String(index + 1).padStart(2, '0')}</span>
                      <div className="flex items-center gap-1">
                        <EditLink to={`/roles/${r.id}/edit`} label={`Edit ${r.name}`} />
                        <DeleteButton label={`Delete ${r.name}`} onClick={() => setToDelete(r)} />
                      </div>
                    </div>
                    <p className="mt-5 text-2xl font-extrabold tracking-[-0.045em]">{humanize(r.name)}</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.description || <span className="text-ink-faint">No description yet.</span>}</p>
                  </div>
                  <div className="flex items-end justify-between border-t border-line pt-5">
                    <span className="text-xs font-bold tracking-[0.12em] text-ink-faint uppercase">Assigned</span>
                    <span className="text-4xl leading-none font-extrabold tracking-[-0.06em] tabular-nums">{userCount ?? '—'}</span>
                  </div>
                </motion.li>
              )
            })}
          </motion.ul>
        )}
        </section>
      </motion.div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this role?"
        confirmLabel="Delete role"
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      >
        “<span className="font-semibold text-ink">{humanize(toDelete?.name)}</span>” will be removed
        {toDelete?.users_count ? `, and ${plural(toDelete.users_count, 'user')} will lose this role` : ''}. This can't be
        undone.
      </ConfirmDialog>
    </Page>
  )
}
