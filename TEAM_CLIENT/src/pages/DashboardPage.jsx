import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { tasksApi } from '../api/tasks'
import { getErrorMessage } from '../api/errors'
import { initialTasksState, tasksReducer } from '../lib/tasksReducer'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'
import { useSocket } from '../socket/SocketContext'
import { useSocketEvent } from '../socket/useSocketEvent'
import { SOCKET_EVENTS } from '../socket/socket'
import { isOwnTask, markOwnTask } from '../socket/ownChanges'
import { Page } from '../components/layout/AppLayout'
import TaskFilters from '../components/tasks/TaskFilters'
import TaskList from '../components/tasks/TaskList'
import TaskForm from '../components/tasks/TaskForm'
import TeamWorkflowIllustration from '../components/tasks/TeamWorkflowIllustration'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { countByStatus } from '../lib/taskStatus'
import { formatDue } from '../lib/format'

const FRESH_MS = 4000
const key = (id) => String(id)

const SPRING = { type: 'spring', stiffness: 260, damping: 24 }
const STATUS_CARDS = [
  { value: 'todo', label: 'Queued', numberClass: 'text-st-todo', dotClass: 'bg-st-todo' },
  { value: 'in_progress', label: 'In motion', numberClass: 'text-st-progress', dotClass: 'bg-st-progress' },
  { value: 'done', label: 'Landed', numberClass: 'text-st-done', dotClass: 'bg-st-done' },
]

const CalendarIcon = () => (
  <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M5 2.5v3M15 2.5v3M3 7.5h14M4.5 4h11A1.5 1.5 0 0117 5.5v11H3v-11A1.5 1.5 0 014.5 4z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Set-in-state helpers that return a new Set (React needs a new reference). */
const withId = (set, id) => new Set(set).add(key(id))
const withoutId = (set, id) => {
  const next = new Set(set)
  next.delete(key(id))
  return next
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { notify } = useNotifications()
  const [state, dispatch] = useReducer(tasksReducer, initialTasksState)
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // { type: 'create' | 'edit' | 'delete', task? }
  const [freshIds, setFreshIds] = useState(() => new Set())
  const [busyIds, setBusyIds] = useState(() => new Set())
  const [deleting, setDeleting] = useState(false)
  const reduceMotion = useReducedMotion()

  const markFresh = useCallback((id) => {
    setFreshIds((s) => withId(s, id))
    setTimeout(() => setFreshIds((s) => withoutId(s, id)), FRESH_MS)
  }, [])

  const load = useCallback(async () => {
    try {
      dispatch({ type: 'loaded', tasks: await tasksApi.list() })
    } catch (err) {
      dispatch({ type: 'failed', error: getErrorMessage(err) })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const retry = () => {
    dispatch({ type: 'loading' })
    load()
  }

  // ---- real-time ----
  // The Node.js service sends `notification` events ({ id, type, title, message, taskId }),
  // not whole tasks. Re-read that task from Laravel and merge it; 403/404 → it's gone for us.
  // (The toast itself is shown app-wide by RealtimeNotifier.)
  const { state: connection } = useSocket()
  const refreshTask = useCallback(
    async (taskId) => {
      try {
        const task = await tasksApi.get(taskId)
        if (!task) return
        dispatch({ type: 'upsert', task })
        if (!isOwnTask(taskId)) markFresh(taskId)
      } catch (err) {
        const status = err?.response?.status
        if (status === 404 || status === 403) dispatch({ type: 'remove', id: taskId })
      }
    },
    [markFresh],
  )
  useSocketEvent(SOCKET_EVENTS.NOTIFICATION, (n) => {
    if (n?.taskId !== undefined && n?.taskId !== null) refreshTask(n.taskId)
  })

  // After a reconnect, refetch so events missed while offline aren't lost.
  const prevConnection = useRef(connection)
  useEffect(() => {
    if (connection === 'live' && prevConnection.current !== 'live' && state.status === 'ready') load()
    prevConnection.current = connection
  }, [connection, state.status, load])

  // ---- mutations ----
  const closeModal = () => setModal(null)

  const handleCreate = async (values) => {
    const task = await tasksApi.create(values)
    if (task?.id !== undefined) {
      markOwnTask(task.id)
      dispatch({ type: 'upsert', task })
    } else {
      await load()
    }
    closeModal()
    notify('Task created', { tone: 'success' })
  }

  const handleEdit = async (values) => {
    const id = modal.task.id
    markOwnTask(id)
    const task = await tasksApi.update(id, values)
    dispatch({ type: 'upsert', task: task ?? { ...modal.task, ...values } })
    closeModal()
    notify('Changes saved', { tone: 'success' })
  }

  const handleStatusChange = useCallback(
    async (task, status) => {
      if (task.status === status) return
      markOwnTask(task.id)
      setBusyIds((s) => withId(s, task.id))
      dispatch({ type: 'upsert', task: { ...task, status } }) // optimistic
      try {
        const saved = await tasksApi.patch(task.id, { status })
        if (saved) dispatch({ type: 'upsert', task: saved })
      } catch (err) {
        dispatch({ type: 'upsert', task }) // roll back
        notify(`Status not changed. ${getErrorMessage(err)}`, { tone: 'error' })
      } finally {
        setBusyIds((s) => withoutId(s, task.id))
      }
    },
    [notify],
  )

  const handleDelete = async () => {
    const { task } = modal
    setDeleting(true)
    markOwnTask(task.id)
    try {
      await tasksApi.remove(task.id)
      dispatch({ type: 'remove', id: task.id })
      closeModal()
      notify('Task deleted', { tone: 'success' })
    } catch (err) {
      notify(`Task not deleted. ${getErrorMessage(err)}`, { tone: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  const openEdit = useCallback((task) => setModal({ type: 'edit', task }), [])
  const openDelete = useCallback((task) => setModal({ type: 'delete', task }), [])
  const openCreate = () => setModal({ type: 'create' })

  // ---- derived ----
  const counts = useMemo(() => countByStatus(state.items), [state.items])

  const pulse = useMemo(() => {
    const open = state.items.filter((task) => task.status !== 'done')
    const focus = open.find((task) => task.priority === 'high') ?? open[0] ?? null
    return {
      open: open.length,
      completion: counts.all ? Math.round((counts.done / counts.all) * 100) : 0,
      focus,
    }
  }, [state.items, counts.all, counts.done])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.items.filter(
      (t) =>
        (statusFilter === 'all' || t.status === statusFilter) &&
        (!q || t.title?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)),
    )
  }, [state.items, statusFilter, query])

  const firstName = user?.name?.split(' ')[0]
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
  const hasFilters = statusFilter !== 'all' || query.trim() !== ''

  const showWorkflowStage = useCallback((status) => {
    setStatusFilter(status)
    document.getElementById('task-stream')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }, [reduceMotion])

  const reveal = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 24 },
    visible: { opacity: 1, y: 0 },
  }

  return (
    <Page wide className="min-h-[calc(100dvh-4rem)]">
      <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.07 }}>
        <motion.header variants={reveal} transition={SPRING} className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold tracking-[0.18em] text-ink-soft uppercase">
              <span>Team command center</span>
              <span className="h-px w-8 bg-line" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 tracking-normal normal-case"><CalendarIcon />{dateLabel}</span>
            </div>
            <h1 className="max-w-4xl text-[clamp(2.35rem,4.2vw,4.5rem)] leading-[0.92] font-extrabold tracking-[-0.055em] text-balance">
              Make work <span className="text-st-done">move.</span>
            </h1>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-4 lg:items-end lg:pb-2 lg:text-right">
            <p className="text-base leading-relaxed text-ink-soft">
              {firstName ? `${firstName}, your live workspace is ready.` : 'Your live workspace is ready.'}{' '}
              {pulse.open ? `${pulse.open} ${pulse.open === 1 ? 'task is' : 'tasks are'} still moving.` : 'The board is clear.'}
            </p>
            <motion.div whileHover={{ scale: 1.035 }} whileTap={{ scale: 0.97 }} transition={SPRING}>
              <Button onClick={openCreate} size="lg" className="!h-14 !rounded-full !bg-ink !px-6">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                </svg>
                Add to the flow
              </Button>
            </motion.div>
          </div>
        </motion.header>

        <motion.section variants={reveal} transition={SPRING} className="grid auto-rows-[minmax(9rem,auto)] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12" aria-label="Task overview">
          <motion.article
            whileHover={{ y: -4 }}
            transition={SPRING}
            className="dashboard-grid relative min-h-60 overflow-hidden rounded-[1.75rem] bg-ink p-6 text-white md:col-span-2 xl:col-span-7 xl:row-span-2"
          >
            <div className="relative z-10 flex h-full flex-col justify-between gap-12">
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70">Today’s focus</span>
                <span className={`inline-flex items-center gap-2 text-xs font-semibold ${connection === 'live' ? 'text-signal' : 'text-white/55'}`}>
                  <span className={`size-2 rounded-full ${connection === 'live' ? 'bg-signal shadow-[0_0_0_5px_rgba(185,232,75,0.14)]' : 'bg-white/40'}`} />
                  {connection === 'live' ? 'Synced live' : connection === 'connecting' ? 'Reconnecting' : 'Working offline'}
                </span>
              </div>

              <div>
                {pulse.focus ? (
                  <>
                    <p className="max-w-3xl text-[clamp(1.5rem,2.8vw,2.8rem)] leading-[1.04] font-bold tracking-[-0.045em] text-balance">
                      {pulse.focus.title}
                    </p>
                    <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-white/65">
                      <span className="rounded-full bg-white/10 px-3 py-1.5 capitalize">{pulse.focus.priority ?? 'medium'} priority</span>
                      {formatDue(pulse.focus.due_date)?.text && (
                        <span className={formatDue(pulse.focus.due_date)?.overdue ? 'font-semibold text-[#ff998f]' : ''}>
                          {formatDue(pulse.focus.due_date).text}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[clamp(1.75rem,3vw,3rem)] leading-none font-bold tracking-[-0.05em]">All clear.</p>
                    <p className="mt-4 max-w-md text-white/60">The board has room for the next important thing.</p>
                  </>
                )}
              </div>
            </div>
            <div className="absolute -right-16 -bottom-24 size-72 rounded-full border-[48px] border-signal/15" aria-hidden="true" />
          </motion.article>

          <TeamWorkflowIllustration
            tasks={state.items}
            completion={pulse.completion}
            user={user}
            onSelectStatus={showWorkflowStage}
          />

          {STATUS_CARDS.map((card) => (
            <motion.button
              key={card.value}
              type="button"
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              transition={SPRING}
              onClick={() => showWorkflowStage(card.value)}
              className={`group flex min-h-28 flex-col justify-between rounded-[1.75rem] border p-5 text-left xl:col-span-4 ${statusFilter === card.value ? 'border-ink bg-ink text-white' : 'border-line bg-surface hover:border-ink/25'}`}
            >
              <span className="flex items-center justify-between text-sm font-bold">
                {card.label}
                <span className={`size-2.5 rounded-full ${card.dotClass}`} />
              </span>
              <span className={`text-5xl leading-none font-extrabold tracking-[-0.07em] tabular-nums ${statusFilter === card.value ? 'text-white' : card.numberClass}`}>
                {counts[card.value] ?? 0}
              </span>
            </motion.button>
          ))}
        </motion.section>

        <motion.section
          id="task-stream"
          variants={reveal}
          transition={SPRING}
          className="mt-3 scroll-mt-24 rounded-[1.75rem] border border-line bg-surface p-4 sm:p-6"
          aria-labelledby="task-stream-title"
        >
          <div className="mb-6 flex flex-col gap-4 border-b border-line-soft pb-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.16em] text-ink-faint uppercase">Live queue</p>
              <h2 id="task-stream-title" className="mt-1 text-2xl font-extrabold tracking-[-0.035em] sm:text-3xl">
                {hasFilters ? `${visible.length} matching ${visible.length === 1 ? 'task' : 'tasks'}` : 'Everything in motion'}
              </h2>
            </div>
            <TaskFilters
              counts={counts}
              status={statusFilter}
              onStatusChange={setStatusFilter}
              query={query}
              onQueryChange={setQuery}
            />
          </div>

          <TaskList
            state={state}
            tasks={visible}
            freshIds={freshIds}
            busyIds={busyIds}
            filtered={hasFilters}
            onRetry={retry}
            onCreate={openCreate}
            onStatusChange={handleStatusChange}
            onEdit={openEdit}
            onDelete={openDelete}
          />
        </motion.section>
      </motion.div>

      <Modal open={modal?.type === 'create'} title="New task" onClose={closeModal}>
        <TaskForm onSubmit={handleCreate} onCancel={closeModal} />
      </Modal>

      <Modal open={modal?.type === 'edit'} title="Edit task" onClose={closeModal}>
        {modal?.type === 'edit' && <TaskForm task={modal.task} onSubmit={handleEdit} onCancel={closeModal} />}
      </Modal>

      <ConfirmDialog
        open={modal?.type === 'delete'}
        title="Delete this task?"
        confirmLabel="Delete task"
        cancelLabel="Keep task"
        busy={deleting}
        onConfirm={handleDelete}
        onClose={closeModal}
      >
        “<span className="font-semibold text-ink">{modal?.task?.title}</span>” will be removed for everyone on the team.
        This can't be undone.
      </ConfirmDialog>
    </Page>
  )
}
