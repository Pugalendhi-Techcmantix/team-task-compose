import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-extrabold tracking-tight">404</p>
        <h1 className="mt-3 text-xl font-bold">This page doesn't exist</h1>
        <p className="mt-2 text-ink-soft">The link may be old or mistyped.</p>
        <Link to="/" className="mt-6 inline-block rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white">
          Go to your tasks
        </Link>
      </div>
    </main>
  )
}
