import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { initials } from '../../lib/format'
import { TASK_STATUS } from '../../lib/taskStatus'

const STAGES = [
  { value: TASK_STATUS.TODO, label: 'Queue', dot: 'bg-st-todo', text: 'text-st-todo', note: 'Ready for the team' },
  { value: TASK_STATUS.IN_PROGRESS, label: 'In progress', dot: 'bg-st-progress', text: 'text-st-progress', note: 'Work is moving' },
  { value: TASK_STATUS.DONE, label: 'Done', dot: 'bg-st-done', text: 'text-st-done', note: 'Crossed the line' },
]

const SPRING = { type: 'spring', stiffness: 320, damping: 28 }

/** Real-data, interactive illustration of the team's task lifecycle. */
export default function TeamWorkflowIllustration({ tasks = [], completion = 0, user, onSelectStatus }) {
  const [active, setActive] = useState(1)
  const [paused, setPaused] = useState(false)
  const reduceMotion = useReducedMotion()

  const grouped = useMemo(
    () => Object.fromEntries(STAGES.map((stage) => [stage.value, tasks.filter((task) => task.status === stage.value)])),
    [tasks],
  )

  useEffect(() => {
    if (paused || reduceMotion) return undefined
    const timer = setInterval(() => setActive((current) => (current + 1) % STAGES.length), 3000)
    return () => clearInterval(timer)
  }, [paused, reduceMotion])

  const stage = STAGES[active]
  const stageTasks = grouped[stage.value] ?? []
  const sample = stageTasks[0]
  const ownedByMe = sample && (sample.user_id === undefined || String(sample.user_id) === String(user?.id))

  return (
    <motion.article
      whileHover={{ y: -4 }}
      transition={SPRING}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative min-h-60 overflow-hidden rounded-[1.75rem] border border-line bg-surface p-5 xl:col-span-5 xl:row-span-2"
      aria-label="Interactive team workflow"
    >
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.15em] text-ink-faint uppercase">Live workflow</p>
          <h2 className="mt-1 text-xl font-extrabold tracking-[-0.035em]">Work moving now</h2>
        </div>
        <span className="rounded-full bg-signal-soft px-3 py-1.5 text-xs font-bold text-st-done tabular-nums">{completion}% complete</span>
      </div>

      <div className="relative z-10 mt-5">
        <div className="absolute top-5 right-[13%] left-[13%] h-px bg-line" aria-hidden="true" />
        {!reduceMotion && (
          <motion.span
            className="absolute top-[1.02rem] left-[13%] z-20 size-2 rounded-full bg-signal shadow-[0_0_0_5px_rgba(185,232,75,0.16)]"
            animate={{ left: ['13%', '50%', '87%'] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
        )}

        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Workflow stages">
          {STAGES.map((item, index) => {
            const selected = index === active
            const count = grouped[item.value]?.length ?? 0
            return (
              <motion.button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(index)}
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
                className={`relative z-10 flex min-w-0 flex-col items-center rounded-xl px-1 py-1.5 text-center ${selected ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
              >
                <span className={`size-2.5 rounded-full border-2 border-surface ${item.dot} ${selected ? 'shadow-[0_0_0_5px_var(--color-signal-soft)]' : ''}`} />
                <span className="mt-2 truncate text-xs font-bold">{item.label}</span>
                <span className="mt-0.5 text-[10px] tabular-nums">{count}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="relative z-10 mt-3 min-h-40">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={stage.value}
            initial={{ opacity: 0, x: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduceMotion ? 0 : -18 }}
            transition={SPRING}
            className="rounded-2xl border border-line bg-paper p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${stage.dot}`} />
                <span className={`text-xs font-bold ${stage.text}`}>{stage.label}</span>
              </div>
              <span className="text-3xl font-extrabold tracking-[-0.06em] tabular-nums">{stageTasks.length}</span>
            </div>

            <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-snug font-extrabold">
              {sample?.title ?? `No tasks ${stage.label.toLowerCase()}`}
            </p>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[10px] font-extrabold ${ownedByMe ? 'bg-signal text-ink' : 'bg-ink text-white'}`}>
                  {ownedByMe ? initials(user?.name) : 'TM'}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold">{sample ? (ownedByMe ? 'Owned by you' : 'Team owned') : stage.note}</p>
                  <p className="truncate text-[10px] text-ink-faint">{sample ? stage.note : 'This stage is clear'}</p>
                </div>
              </div>
              <motion.button
                type="button"
                onClick={() => onSelectStatus(stage.value)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING}
                className="shrink-0 rounded-full bg-ink px-3 py-2 text-[10px] font-bold text-white"
              >
                Show tasks
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 mt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold text-ink-faint">
          <span>Team progress</span>
          <span>{tasks.length ? `${Math.round((grouped[TASK_STATUS.DONE]?.length / tasks.length) * 100)}%` : '0%'}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line-soft">
          <motion.div
            initial={false}
            animate={{ width: `${completion}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
            className="h-full rounded-full bg-st-done"
          />
        </div>
      </div>

      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />
    </motion.article>
  )
}
