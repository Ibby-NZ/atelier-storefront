import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'

// Login island (US-021). Posts { email, password } to POST /auth/login. On
// success the API sets the session cookie; we redirect home (or to a ?redirect=
// path when present) and the header re-reads /auth/me to show the account name.
// A 401 returns { error: 'Invalid email or password.' }, surfaced inline via
// ApiError.message. Single component (store ESLint has no React plugin).

function redirectTarget() {
  if (typeof window === 'undefined') return '/'
  const to = new URLSearchParams(window.location.search).get('redirect')
  // Only allow same-site relative paths — never an absolute/off-site URL.
  return to && to.startsWith('/') && !to.startsWith('//') ? to : '/'
}

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setSubmitting(true)
    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (typeof window !== 'undefined') window.location.href = redirectTarget()
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
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Logging in…' : 'Log in'}
      </button>

      <p className="auth-alt">
        New here? <a href="/register">Create an account</a> or{' '}
        <a href="/trade-application">apply for trade</a>.
      </p>
    </form>
  )
}
