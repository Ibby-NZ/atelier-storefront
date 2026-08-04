import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { BREAK_GLASS, breakGlassEnabled } from '../lib/breakGlassConfig.js'
import { TRADE_APPLICATION_PATH } from '../lib/tradeGate.js'
import {
  browserStorage,
  isApiUnreachable,
  startBreakGlassSession,
  verifyBreakGlass,
} from '../lib/breakGlass.js'

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
//
// SECOND, EMERGENCY PATH: when the API does not answer at all, the same two
// fields accept the break-glass credentials (../lib/breakGlass.js) and open a
// local, clearly-labelled offline session. Never advertised up front — the note
// appears only after an attempt has failed unreachably, and only in a build that
// was given a credential. A 401 stays a 401: a wrong password is not an outage.

const UNREACHABLE_MESSAGE = breakGlassEnabled
  ? 'The store service did not answer. If it is down, sign in with the offline access details.'
  : 'The store service did not answer. Please try again shortly.'

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
  const [unreachable, setUnreachable] = useState(false)

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
      // Only a genuine outage opens the emergency door. Anything the API
      // answered — 401, 403, 429 — stays a plain refusal.
      if (err instanceof ApiError && isApiUnreachable(err)) {
        if (verifyBreakGlass(BREAK_GLASS, { email, password })
          && startBreakGlassSession(browserStorage(), BREAK_GLASS)) {
          if (typeof window !== 'undefined') window.location.href = redirectTarget()
          return
        }
        setUnreachable(true)
        setError(UNREACHABLE_MESSAGE)
        setSubmitting(false)
        return
      }
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

      {/* Only after a real outage, and only where a credential was built in. */}
      {unreachable && breakGlassEnabled && (
        <p className="auth-screen-alt">
          Offline access: enter the emergency email and passphrase above to open the site
          without the store service. Browsing still works; orders, the cart and your account
          history will not.
        </p>
      )}

      <button className="cta-underline cta-underline-light" type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>

      {/* The mock omits this line; it cannot simply go, because the trade
          application is reachable from nowhere else on a signed-out site. It
          used to offer a standard account first and trade second — the client
          has no standard-customer account product and does not want one, so
          trade is now the only door, and it is also what opens the represented
          houses' designs (see lib/tradeGate.js). */}
      <p className="auth-screen-alt">
        No account yet? <a href={TRADE_APPLICATION_PATH}>Apply for a trade account</a> — approval
        opens trade pricing and the full library.
      </p>
    </form>
  )
}
