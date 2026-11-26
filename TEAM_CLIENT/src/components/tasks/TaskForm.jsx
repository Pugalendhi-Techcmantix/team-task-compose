import { useState } from 'react'
import { EMPTY_TASK, PRIORITY_OPTIONS, STATUS_OPTIONS, validateTask } from '../../lib/validateTask'
import { TASK_STATUS } from '../../lib/taskStatus'
import { getErrorMessage, getFieldErrors } from '../../api/errors'
import Field, { SelectInput, TextArea, TextInput } from '../ui/Field'
import Button from '../ui/Button'
import FormAlert from '../ui/FormAlert'

const toFormValues = (task) =>
  task
    ? {
        title: task.title ?? '',
        description: task.description ?? '',
        status: task.status ?? TASK_STATUS.TODO,
        priority: task.priority ?? 'medium',
        due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
      }
    : EMPTY_TASK

/**
 * Create / edit form. `onSubmit(values)` must return a promise; a rejected
 * Laravel 422 is mapped back onto the fields.
 */
export default function TaskForm({ task, onSubmit, onCancel }) {
  const [values, setValues] = useState(() => toFormValues(task))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const editing = Boolean(task)

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const local = validateTask(values)
    setErrors(local)
    setFormError('')
    if (Object.keys(local).length) return

    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <FormAlert>{formError}</FormAlert>

      <Field label="Title" error={errors.title}>
        {(a) => (
          <TextInput {...a} value={values.title} onChange={set('title')} maxLength={300} placeholder="What needs to happen?" />
        )}
      </Field>

      <Field label="Description" error={errors.description} optional>
        {(a) => <TextArea {...a} value={values.description} onChange={set('description')} rows={3} placeholder="Details, links, acceptance criteria" />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" error={errors.status}>
          {(a) => <SelectInput {...a} options={STATUS_OPTIONS} value={values.status} onChange={set('status')} />}
        </Field>
        <Field label="Priority" error={errors.priority}>
          {(a) => <SelectInput {...a} options={PRIORITY_OPTIONS} value={values.priority} onChange={set('priority')} />}
        </Field>
      </div>

      <Field label="Due date" error={errors.due_date} optional>
        {(a) => <TextInput {...a} type="date" value={values.due_date} onChange={set('due_date')} />}
      </Field>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {editing ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </form>
  )
}
