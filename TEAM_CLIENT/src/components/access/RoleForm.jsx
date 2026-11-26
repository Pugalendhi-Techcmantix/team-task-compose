import { useForm } from '../../hooks/useForm'
import { validateRole } from '../../lib/validateAccess'
import Field, { TextArea, TextInput } from '../ui/Field'
import FormAlert from '../ui/FormAlert'
import FormActions, { FormSection } from './FormActions'

/** Create / edit a role (roles master: name + description). */
export default function RoleForm({ role, onSubmit, onCancel }) {
  const isNew = !role
  const { bind, errors, formError, submitting, submit } = useForm({
    name: role?.name ?? '',
    description: role?.description ?? '',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    submit(validateRole, onSubmit)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <FormAlert>{formError}</FormAlert>

      <FormSection title="Details">
        <div className="space-y-4">
          <Field label="Name" error={errors.name} hint="Lowercase, e.g. editor or team-lead.">
            {(a) => <TextInput {...a} {...bind('name')} autoComplete="off" />}
          </Field>
          <Field label="Description" error={errors.description} optional>
            {(a) => <TextArea {...a} {...bind('description')} rows={2} placeholder="Who should have this role?" />}
          </Field>
        </div>
      </FormSection>

      <FormActions submitLabel={isNew ? 'Create role' : 'Save changes'} submitting={submitting} onCancel={onCancel} />
    </form>
  )
}
