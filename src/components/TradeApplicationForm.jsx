import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'

// Trade-application island (US-021, FR-3). Posts { name?, email, password } to
// POST /auth/trade-application — this creates a role=trade account with
// trade_approved=false (approval is MANUAL: the back office flips the flag
// later, there is no self-serve approval). On success we do NOT redirect;
// instead we show a confirmation that explains the manual approval so the
// applicant knows trade pricing isn't live yet. The account is created and
// logged in immediately (session cookie set), but behaves as a customer until
// approved. Single component (store ESLint has no React plugin).

const MIN_PASSWORD_LENGTH = 8

export default function TradeApplicationForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

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
      await apiFetch('/auth/trade-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="auth-success">
        <h2>Application received</h2>
        <p>
          Your trade account has been created and you are now logged in. Trade
          pricing is approved <strong>manually</strong> by our team — we will
          review your application and be in touch. Until it is approved your
          account works as a standard customer account.
        </p>
        <a className="btn btn-primary" href="/products">
          Browse the catalogue
        </a>
      </div>
    )
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <p className="auth-intro">
        Apply for a trade account to access trade pricing. Approval is manual —
        we review each application before enabling trade prices.
      </p>

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
        {submitting ? 'Submitting…' : 'Apply for trade account'}
      </button>

      <p className="auth-alt">
        Not trade? <a href="/register">Create a standard account</a>.
      </p>
    </form>
  )
}
