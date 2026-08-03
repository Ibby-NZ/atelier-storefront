import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'

// Login island (US-021), 2026 direction (design: Figma "Sign in Page 2",
// node 9350:361). Posts { email, password } to POST /auth/login. On success the
// API sets the session cookie; we redirect home (or to a ?redirect= path when
// present) and the header re-reads /auth/me to show the account icon's
// signed-in destination. A 401 returns { error: 'Invalid email or password.' },
// surfaced inline via ApiError.message.
//
// The mock labels both fields with placeholders alone. Placeholders are not
// labels — they vanish the moment someone types — so each field keeps a real
// <label>, visually hidden. Single component (store ESLint has no React
// plugin).

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
    <form className="auth-screen-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="auth-screen-error" role="alert">
          {error}
        </p>
      )}

      <div className="auth-screen-fields">
        <label className="sr-only" htmlFor="auth-email">
          Email
        </label>
        <input
          className="auth-screen-input"
          id="auth-email"
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="sr-only" htmlFor="auth-password">
          Password
        </label>
        <input
          className="auth-screen-input"
          id="auth-password"
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <button className="cta-underline cta-underline-light" type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="auth-screen-alt">
        New here? <a href="/register">Create an account</a> or{' '}
        <a href="/trade-application">apply for trade</a>.
      </p>
    </form>
  )
}
