import { useState } from 'react'
import { usersApi } from '../../api/access'
import { chatApi } from '../../api/chat'
import { getErrorMessage, getFieldErrors } from '../../api/errors'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { useFetch } from '../../hooks/useFetch'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Checkbox from '../ui/Checkbox'
import Field, { TextInput } from '../ui/Field'
import FormAlert from '../ui/FormAlert'
import Spinner from '../ui/Spinner'

/** Pick people (and a name for a group) to start a conversation. */
export default function NewConversationDialog({ open, meId, onClose, onCreated }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState([]) // [{ id, name }]
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const q = useDebouncedValue(search.trim(), 250)

  const people = useFetch(() => (open ? usersApi.list({ per_page: 20, ...(q && { search: q }) }) : Promise.resolve(null)), [open, q])
  const options = (people.data?.items ?? []).filter((u) => String(u.id) !== String(meId))
  const isPicked = (id) => selected.some((u) => String(u.id) === String(id))
  const toggle = (u) => setSelected((list) => (isPicked(u.id) ? list.filter((x) => String(x.id) !== String(u.id)) : [...list, { id: u.id, name: u.name }]))

  const close = () => {
    setSearch('')
    setSelected([])
    setName('')
    setError('')
    onClose()
  }

  const create = async (e) => {
    e.preventDefault()
    if (selected.length === 0) {
      setError('Choose at least one person.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const conversation = await chatApi.createConversation({ memberIds: selected.map((u) => u.id), name: selected.length > 1 ? name : '' })
      close()
      onCreated(conversation)
    } catch (err) {
      const fields = getFieldErrors(err)
      // show whichever field the backend complains about (user_id, user_ids, type, name…)
      setError(Object.values(fields).find(Boolean) || getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title="New conversation" onClose={close}>
      <form onSubmit={create} noValidate className="space-y-4">
        <FormAlert>{error}</FormAlert>
        <label className="block">
          <span className="sr-only">Search people</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people by name or email"
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-ink-faint focus:ring-2 focus:ring-ink/15 focus:outline-none"
          />
        </label>

        {selected.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected people">
            {selected.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => toggle(u)} className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white hover:bg-ink/85" aria-label={`Remove ${u.name}`}>
                  {u.name} ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
          {people.status === 'loading' && !people.data ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-ink-soft" role="status">
              <Spinner className="size-4" /> Loading people
            </p>
          ) : people.status === 'error' ? (
            <p className="px-4 py-6 text-sm text-danger" role="alert">
              {people.error}
            </p>
          ) : options.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-soft">No one matches “{q}”.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {options.map((u) => (
                <li key={u.id} className="px-3 py-2">
                  <Checkbox label={u.name} hint={u.email} checked={isPicked(u.id)} onChange={() => toggle(u)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected.length > 1 && (
          <Field label="Group name" optional hint="Shown to everyone in the conversation.">
            {(a) => <TextInput {...a} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Release crew" />}
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={selected.length === 0}>
            {selected.length > 1 ? 'Start group' : 'Start chat'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
