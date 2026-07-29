import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'

// Contact form island. Posts to POST /contact, which stores the enquiry and
// emails the back office. Mirrors OrderRequestForm.jsx: client-side validation,
// inline field errors mapped from the API's 422 { errors: [{ field, message }] },
// a form-level message for anything else, and a success panel on 201.
//
// Prefills name/email for a signed-in visitor (fetchCurrentUser never throws;
// guests just start with blank fields). Everything renders in one component —
// the store's ESLint has no React plugin, so a JSX-only sub-component reference
// would trip no-unused-vars (same constraint as the other islands).

export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({}) // { name, email, message }
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let active = true
    fetchCurrentUser().then((user) => {
      if (!active || !user) return
      if (user.name) setName(user.name)
      if (user.email) setEmail(user.email)
    })
    return () => {
      active = false
    }
  }, [])

  if (sent) {
    return (
      <div className="request-success" role="status">
        <h2>Thank you</h2>
        <p>
          Your enquiry has been sent. A member of our team will respond within
          one business day.
        </p>
        <a className="btn btn-primary" href="/products">
          Browse the collection
        </a>
      </div>
    )
  }

  const validate = () => {
    const errors = {}
    if (!name.trim()) errors.name = 'Please tell us your name.'
    if (!email.trim()) errors.email = 'A valid email is required.'
    if (!message.trim()) errors.message = 'Please include a message.'
    return errors
  }

  // Map API 422 field paths (name / email / message) onto our fields.
  const applyServerErrors = (serverErrors) => {
    const mapped = {}
    for (const item of serverErrors) {
      if (typeof item?.field !== 'string') continue
      if (['name', 'email', 'message'].includes(item.field)) {
        mapped[item.field] = item.message
      }
    }
    return mapped
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      return
    }
    setFieldErrors({})
    setSubmitting(true)

    try {
      await apiFetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          subject: subject.trim() || undefined,
          message: message.trim(),
        }),
      })
      setSent(true)
    } catch (err) {
      const serverErrors = err instanceof ApiError ? err.body?.errors : null
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        setFieldErrors(applyServerErrors(serverErrors))
      }
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'We could not send your enquiry. Please try again.'
      )
      setSubmitting(false)
    }
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate>
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
      </label>

      <label className="field">
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      </label>

      <label className="field">
        <span>Phone (optional)</span>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </label>

      <label className="field">
        <span>Subject (optional)</span>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>

      <label className="field">
        <span>Message</span>
        <textarea
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your project, the fabrics you're interested in, or a stock enquiry…"
        />
        {fieldErrors.message && <span className="field-error">{fieldErrors.message}</span>}
      </label>

      {submitError && <p className="error-state">{submitError}</p>}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send enquiry'}
      </button>
    </form>
  )
}
