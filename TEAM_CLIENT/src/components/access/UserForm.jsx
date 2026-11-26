import { useForm } from '../../hooks/useForm'
import { validateUser } from '../../lib/validateAccess'
import { humanize, rolesOf } from '../../lib/roles'
import Field, { SelectInput, TextInput } from '../ui/Field'
import FormAlert from '../ui/FormAlert'
import FormActions, { FormSection } from './FormActions'

/** The user's current role id: backend `role_id`, else the first of `role` / `roles`. */
const roleIdOf = (user) => {
  const id = user?.role_id ?? rolesOf(user)[0]?.id
  return id == null ? '' : String(id)
}

/**
 * Create / edit a user and pick their role (one role per user).
 * `onSubmit(values)` → promise; values.role_id is the selected role id (string from the select).
 */
export default function UserForm({ user, roles, onSubmit, onCancel }) {
  const isNew = !user
  const { bind, errors, formError, submitting, submit } = useForm({
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    password_confirmation: '',
    role_id: roleIdOf(user),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    submit((v) => validateUser(v, { isNew }), onSubmit)
  }

  const roleOptions = [
    { value: '', label: roles.length ? 'Choose a role' : 'No roles exist yet' },
    ...roles.map((r) => ({ value: String(r.id), label: humanize(r.name) })),
  ]
  const selected = roles.find((r) => String(r.id) === bind('role_id').value)

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <FormAlert>{formError}</FormAlert>

      <FormSection title="Profile">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name}>
            {(a) => <TextInput {...a} {...bind('name')} autoComplete="off" />}
          </Field>
          <Field label="Email" error={errors.email}>
            {(a) => <TextInput {...a} {...bind('email')} type="email" autoComplete="off" />}
          </Field>
        </div>
      </FormSection>

      <FormSection title="Role">
        <div className="sm:w-1/2 sm:pr-2">
          <Field label="Role" error={errors.role_id} hint={selected?.description || undefined}>
            {(a) => <SelectInput {...a} {...bind('role_id')} options={roleOptions} />}
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Password"
        description={isNew ? 'They can change it after signing in.' : 'Leave blank to keep the current password.'}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isNew ? 'Password' : 'New password'} error={errors.password} hint="At least 8 characters.">
            {(a) => <TextInput {...a} {...bind('password')} type="password" autoComplete="new-password" />}
          </Field>
          <Field label="Confirm password" error={errors.password_confirmation}>
            {(a) => <TextInput {...a} {...bind('password_confirmation')} type="password" autoComplete="new-password" />}
          </Field>
        </div>
      </FormSection>

      <FormActions submitLabel={isNew ? 'Create user' : 'Save changes'} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
