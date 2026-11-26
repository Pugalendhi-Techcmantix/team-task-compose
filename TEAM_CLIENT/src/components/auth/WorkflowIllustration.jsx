import { useEffect, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'

const STAGES = [
  { label: 'Queued', count: 2, dot: 'bg-st-todo', tone: 'text-st-todo', note: 'Ready to start' },
  { label: 'In motion', count: 2, dot: 'bg-st-progress', tone: 'text-st-progress', note: 'Sam is working' },
  { label: 'Done', count: 1, dot: 'bg-st-done', tone: 'text-st-done', note: 'Synced to team' },
]

const SPRING = { type: 'spring', stiffness: 320, damping: 28 }

/** A small, interactive model of TaskFlow's real-time task lifecycle. */
export default function WorkflowIllustration() {
  const [active, setActive] = useState(1)
  const [paused, setPaused] = useState(false)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (paused || reduceMotion) return undefined
    const timer = setInterval(() => setActive((current) => (current + 1) % STAGES.length), 2600)
    return () => clearInterval(timer)
  }, [paused, reduceMotion])

  return (
    <motion.section
      initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: 0.18 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative mt-7 overflow-hidden rounded-[1.5rem] border border-white/12 bg-white/5 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
      aria-label="Interactive task workflow illustration"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-white/45 uppercase">Live flow</p>
          <p className="mt-1 text-sm font-semibold text-white/85">Watch one task move across the team</p>
        </div>
        <div className="flex -space-x-2" aria-label="Three teammates online">
          {['PN', 'SR', 'AC'].map((name, index) => (
            <motion.span
              key={name}
              whileHover={{ y: -4, zIndex: 3 }}
              transition={SPRING}
              className={`grid size-8 place-items-center rounded-full border-2 border-ink text-[9px] font-extrabold ${index === 0 ? 'bg-signal text-ink' : 'bg-white/15 text-white'}`}
            >
              {name}
            </motion.span>
          ))}
        </div>
      </div>

      <div className="relative mt-5">
        <div className="absolute top-[1.15rem] right-[14%] left-[14%] h-px bg-white/12" aria-hidden="true" />
        {!reduceMotion && (
          <motion.span
            className="absolute top-[0.91rem] left-[14%] z-10 size-2 rounded-full bg-signal shadow-[0_0_12px_var(--color-signal)]"
            animate={{ left: ['14%', '50%', '86%'] }}
            transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          />
        )}

        <LayoutGroup id="login-workflow">
          <div className="grid grid-cols-3 gap-2">
            {STAGES.map((stage, index) => {
              const selected = active === index
              return (
                <div key={stage.label} className="relative min-w-0">
                  <motion.button
                    type="button"
                    onClick={() => setActive(index)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING}
                    className={`relative z-20 flex w-full flex-col items-center rounded-xl px-1 py-1 text-center focus-visible:outline-signal ${selected ? 'text-white' : 'text-white/45'}`}
                    aria-pressed={selected}
                  >
                    <span className={`size-2.5 rounded-full border-2 border-ink ${stage.dot} ${selected ? 'shadow-[0_0_0_5px_rgba(255,255,255,0.07)]' : ''}`} />
                    <span className="mt-2 text-[11px] font-bold">{stage.label}</span>
                    <span className="mt-0.5 text-[10px] text-white/35">{stage.count}</span>
                  </motion.button>

                  <div className={`mt-2 flex min-h-28 items-center rounded-xl border p-2 transition-colors ${selected ? 'border-white/12 bg-white/6' : 'border-transparent'}`}>
                    {selected && (
                      <motion.article
                        layoutId="traveling-task-card"
                        transition={SPRING}
                        className="w-full rounded-xl border border-line/60 bg-surface p-3 text-left text-ink shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`size-2 rounded-full ${stage.dot}`} />
                          <motion.span
                            key={stage.label}
                            initial={{ opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`text-[9px] font-bold uppercase ${stage.tone}`}
                          >
                            {stage.label}
                          </motion.span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-snug font-extrabold">Connect live task updates</p>
                        <p className="mt-1 truncate text-[9px] text-ink-faint">{stage.note}</p>
                      </motion.article>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </LayoutGroup>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-black/10 px-3 py-2 text-[10px] text-white/45">
        <span className="inline-flex items-center gap-2">
          <motion.span
            animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="size-1.5 rounded-full bg-signal"
          />
          Changes broadcast instantly
        </span>
        <span>Click a stage</span>
      </div>
    </motion.section>
  )
}
