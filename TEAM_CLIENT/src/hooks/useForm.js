import { useState } from 'react'
import { getErrorMessage, getFieldErrors } from '../api/errors'

/**
 * Small form helper: values, field errors, banner error, submitting flag.
 * `submit(validate, action)` runs client validation, then the async action,
 * mapping a backend 422 back onto fields.
 */
export function useForm(initial) {
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const setField = (field, value) => {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  const bind = (field) => ({ value: values[field] ?? '', onChange: (e) => setField(field, e.target.value) })

  const submit = async (validate, action) => {
    const local = validate(values)
    setErrors(local)
    setFormError('')
    if (Object.keys(local).length) return false
    setSubmitting(true)
    try {
      await action(values)
      return true
    } catch (err) {
      const fields = getFieldErrors(err)
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(getErrorMessage(err))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  return { values, setValues, setField, bind, errors, formError, submitting, submit }
}
