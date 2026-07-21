import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'

// Register island (US-021). Posts { name?, email, password } to
// POST /auth/register (role=customer). On success the API sets the session
// cookie and returns 201; we redirect home and the header shows the account
// name. A 409 returns { error: 'An account with that email already exists.' }.
// The API schema requires password >= 8 chars, so we check that client-side to
// give a friendly message instead of the raw schema 400. Single component
// (store ESLint has no React plugin).

const MIN_PASSWORD_LENGTH = 8

export default function RegisterForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Enter your email.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    const payload = { email: email.trim(), password }
    if (name.trim()) payload.name = name.trim()

    setSubmitting(true)
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (typeof window !== 'undefined') window.location.href = '/'
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <label className="field">
        <span>Name</span>
        <input
          type="text"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <span className="field-hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </label>

      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p className="auth-alt">
        Already have an account? <a href="/login">Log in</a>.
      </p>
    </form>
  )
}
