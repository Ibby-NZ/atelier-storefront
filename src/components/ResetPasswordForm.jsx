import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { FORGOT_PASSWORD_PATH, newPasswordError, readResetToken } from '../lib/passwordReset.js'

// Reset password. Lands from the emailed link with ?token=; the island reads it
// client-side because every storefront page is prerendered. Two fields so a
// typo does not lock the person out of the account they just recovered. On
// success the API sets no session — they sign in with the new password.
export default function ResetPasswordForm() {
  const [token, setToken] = useState('')
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setToken(readResetToken(window.location.search))
    setChecked(true)
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    const problem = newPasswordError(password, confirm)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!checked) return null

  if (!token) {
    return (
      <div className="auth-screen-form">
        <p className="auth-screen-error" role="alert">
          This reset link is missing its code. Open the link from the email, or request a new one.
        </p>
        <p className="auth-screen-alt">
          <a href={FORGOT_PASSWORD_PATH}>Request a new reset link</a>
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="auth-screen-form">
        <p className="auth-screen-error" role="status">
          Your password has been changed.
        </p>
        <a className="cta-underline cta-underline-light" href="/login">Sign in</a>
      </div>
    )
  }

  return (
    <form className="auth-screen-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="auth-screen-error" role="alert">{error}</p>
      )}

      <div className="auth-screen-fields">
        <label className="sr-only" htmlFor="reset-password">New password</label>
        <input
          className="auth-screen-input"
          id="reset-password"
          type="password"
          name="password"
          placeholder="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <label className="sr-only" htmlFor="reset-confirm">Confirm new password</label>
        <input
          className="auth-screen-input"
          id="reset-confirm"
          type="password"
          name="confirm"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      <button className="cta-underline cta-underline-light" type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Set new password'}
      </button>

      <p className="auth-screen-alt">
        Link expired? <a href={FORGOT_PASSWORD_PATH}>Request a new one</a>
      </p>
    </form>
  )
}
