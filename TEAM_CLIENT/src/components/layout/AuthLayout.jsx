import { env } from '../../config/env'
import { motion, useReducedMotion } from 'framer-motion'
import WorkflowIllustration from '../auth/WorkflowIllustration'

export function Brand({ inverted = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={inverted ? '#ffffff' : '#1B2430'} />
        <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#D8FF72" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-lg font-extrabold tracking-tight ${inverted ? 'text-white' : 'text-ink'}`}>{env.appName}</span>
    </div>
  )
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  const reduceMotion = useReducedMotion()
  const eyebrow = title.toLowerCase().includes('create') ? 'Get started' : 'Welcome back'

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.45 }}
        className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-ink p-8 text-white lg:flex xl:p-10"
      >
        <div className="relative z-10 flex items-center justify-between">
          <Brand inverted />
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/65">
            <span className="size-2 rounded-full bg-signal shadow-[0_0_0_5px_rgba(185,232,75,0.12)]" />
            Live workspace
          </span>
        </div>

        <div className="relative z-10 my-8 max-w-xl">
          <motion.p
            initial={{ opacity: 0, y: reduceMotion ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 24, delay: 0.08 }}
            className="text-[clamp(2.6rem,4.6vw,4.8rem)] leading-[0.94] font-extrabold tracking-[-0.06em] text-balance"
          >
            Keep every moving part <span className="text-signal">in sync.</span>
          </motion.p>
          <p className="mt-5 max-w-md leading-relaxed text-white/55">One clear place for tasks, teammates, and the changes happening right now.</p>

          <WorkflowIllustration />
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-white/40">
          <span>Real-time collaboration</span>
          <span>REST + Socket.IO</span>
        </div>
        <motion.div
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 36, repeat: Infinity, ease: 'linear' }}
          className="absolute -right-40 -bottom-48 size-[32rem] rounded-full border-[72px] border-signal/10"
          aria-hidden="true"
        />
        <div className="dashboard-grid absolute inset-0 opacity-25" aria-hidden="true" />
      </motion.aside>

      <main className="flex min-h-dvh flex-col bg-paper px-4 py-6 sm:px-8 lg:justify-center lg:px-10">
        <div className="lg:hidden">
          <Brand />
        </div>
        <motion.section
          initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 240, damping: 26, delay: 0.08 }}
          className="mx-auto mt-8 w-full max-w-md rounded-[1.75rem] border border-line bg-surface p-5 shadow-[0_20px_60px_rgba(23,32,25,0.07)] sm:p-8 lg:mt-0"
        >
          <span className="inline-flex rounded-full bg-signal-soft px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-st-done uppercase">{eyebrow}</span>
          <h1 className="mt-4 text-[2.15rem] leading-tight font-extrabold tracking-[-0.045em]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <p className="mt-7 border-t border-line-soft pt-5 text-sm text-ink-soft">{footer}</p>}
        </motion.section>
      </main>
    </div>
  )
}
