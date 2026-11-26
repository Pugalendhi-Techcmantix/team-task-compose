export default function FormAlert({ children }) {
  if (!children) return null
  return (
    <div role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3 text-sm text-danger">
      {children}
    </div>
  )
}
