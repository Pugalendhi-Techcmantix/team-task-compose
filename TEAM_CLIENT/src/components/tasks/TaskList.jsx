import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import TaskRow from './TaskRow'
import { AnimatePresence, motion } from 'framer-motion'

export default function TaskList({
  state,
  tasks,
  freshIds,
  busyIds,
  filtered,
  onRetry,
  onCreate,
  onStatusChange,
  onEdit,
  onDelete,
}) {
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-line bg-paper py-16 text-sm text-ink-soft" role="status">
        <Spinner /> Loading tasks
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-2xl border border-danger/25 bg-danger-soft/40 px-6 py-12 text-center" role="alert">
        <p className="font-semibold">Tasks couldn't be loaded</p>
        <p className="mt-1 text-sm text-ink-soft">{state.error}</p>
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-paper px-6 py-14 text-center">
        {filtered ? (
          <>
            <p className="font-semibold">No tasks match</p>
            <p className="mt-1 text-sm text-ink-soft">Try another status or search term.</p>
          </>
        ) : (
          <>
            <p className="font-semibold">No tasks yet</p>
            <p className="mt-1 text-sm text-ink-soft">Add the first one. Your team sees it the moment you save.</p>
            <Button className="mt-5" onClick={onCreate}>
              New task
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <motion.ul layout className="grid gap-2.5" aria-label="Tasks">
      <AnimatePresence initial={false} mode="popLayout">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            fresh={freshIds.has(String(task.id))}
            busy={busyIds.has(String(task.id))}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </AnimatePresence>
    </motion.ul>
  )
}
