import Spinner from './Spinner'

export default function FullScreenLoader({ label = 'Loading your workspace' }) {
  return (
    <div className="grid min-h-dvh place-items-center text-ink-soft" role="status">
      <div className="flex items-center gap-3 text-sm">
        <Spinner />
        {label}
      </div>
    </div>
  )
}
