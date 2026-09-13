import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { honeypotField } from './honeypotField.jsx'

// Forgot password. One field, one POST. The API answers 202 with the same
// sentence whether or not the address is registered, so the "sent" state
// repeats that sentence rather than claiming an email is on its way.
export default function ForgotPasswordForm() {
  const [website, setWebsite] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Enter the email you sign in with.')
      return
    }
    setSubmitting(true)
    try {
      const body = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website: website || undefined, email: email.trim() }),
      })
      setSent(body?.message || 'If an account exists for that address, a reset link has been emailed to it.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-screen-form">
        <p className="auth-screen-error" role="status">{sent}</p>
        <p className="auth-screen-alt">
          The link works once and expires in an hour. <a href="/login">Back to sign in</a>
        </p>
      </div>
    )
  }

  return (
    <form className="auth-screen-form" onSubmit={handleSubmit} noValidate>
      {honeypotField(website, setWebsite)}
      {error && (
        <p className="auth-screen-error" role="alert">{error}</p>
      )}

      <div className="auth-screen-fields">
        <label className="sr-only" htmlFor="forgot-email">Email</label>
        <input
          className="auth-screen-input"
          id="forgot-email"
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <button className="cta-underline cta-underline-light" type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Email me a reset link'}
      </button>

      <p className="auth-screen-alt">
        Remembered it? <a href="/login">Back to sign in</a>
      </p>
    </form>
  )
}
