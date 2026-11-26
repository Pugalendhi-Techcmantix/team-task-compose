import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage, getFieldErrors } from '../api/errors'
import AuthLayout from '../components/layout/AuthLayout'
import Field, { TextInput } from '../components/ui/Field'
import Button from '../components/ui/Button'
import FormAlert from '../components/ui/FormAlert'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validate(v) {
  const e = {}
  if (!v.name.trim()) e.name = 'Enter your name.'
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address.'
  if (v.password.length < 8) e.password = 'Use at least 8 characters.'
  if (v.password_confirmation !== v.password) e.password_confirmation = "Passwords don't match."
  return e
}

export default function RegisterPage() {
  const { register } = useAuth()
  const [values, setValues] = useState({ name: '', email: '', password: '', password_confirmation: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const local = validate(values)
    setErrors(local)
    setFormError('')
    if (Object.keys(local).length) return

    setSubmitting(true)
    try {
      await register({ ...values, name: values.name.trim(), email: values.email.trim() })
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start tracking tasks with your team."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormAlert>{formError}</FormAlert>
        <Field label="Name" error={errors.name}>
          {(a) => <TextInput {...a} autoComplete="name" value={values.name} onChange={set('name')} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(a) => (
            <TextInput {...a} type="email" autoComplete="email" inputMode="email" value={values.email} onChange={set('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password} hint="At least 8 characters.">
          {(a) => (
            <TextInput {...a} type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />
          )}
        </Field>
        <Field label="Confirm password" error={errors.password_confirmation}>
          {(a) => (
            <TextInput
              {...a}
              type="password"
              autoComplete="new-password"
              value={values.password_confirmation}
              onChange={set('password_confirmation')}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={submitting} className="w-full !rounded-xl">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
