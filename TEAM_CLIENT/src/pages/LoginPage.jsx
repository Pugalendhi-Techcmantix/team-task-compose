import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { getErrorMessage, getFieldErrors } from '../api/errors'
import AuthLayout from '../components/layout/AuthLayout'
import Field, { TextInput } from '../components/ui/Field'
import Button from '../components/ui/Button'
import FormAlert from '../components/ui/FormAlert'

export default function LoginPage() {
  const { login } = useAuth()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    const local = {}
    if (!values.email.trim()) local.email = 'Enter your email.'
    if (!values.password) local.password = 'Enter your password.'
    setErrors(local)
    setFormError('')
    if (Object.keys(local).length) return

    setSubmitting(true)
    try {
      await login({ email: values.email.trim(), password: values.password })
      // GuestRoute redirects once status becomes 'authenticated'
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where your team left off."
      footer={
        <>
          New to TaskFlow?{' '}
          <Link to="/register" className="font-semibold text-ink underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormAlert>{formError}</FormAlert>
        <Field label="Email" error={errors.email}>
          {(a) => (
            <TextInput {...a} type="email" autoComplete="email" inputMode="email" value={values.email} onChange={set('email')} />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(a) => (
            <div className="relative">
              <TextInput {...a} className="pr-16" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={values.password} onChange={set('password')} />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-ink-faint transition-colors hover:bg-line-soft hover:text-ink"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          )}
        </Field>
        <Button type="submit" size="lg" loading={submitting} className="w-full !rounded-xl">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
