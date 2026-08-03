import { useEffect, useState } from 'react'
import { fetchCurrentUser, accountLabel } from '../lib/auth.js'

// Header account island (US-021), 2026 direction. The design gives the header a
// single 24px account icon (Figma 9346:1681) with no room for a name or a Log
// out button, so this island is now just a destination: /login for a guest,
// /account for a signed-in user, with the name carried in the accessible label
// rather than on screen. LOG OUT MOVED TO /account (Account.jsx) — it has to
// live somewhere reachable, and the account page is where the design would put
// it.
//
// The site is a static build, so login state is resolved at runtime via
// GET /auth/me. It renders the guest link while the first request is in flight:
// guest is the common case and both states are the same 24px box, so nothing
// moves either way.
//
// Single component by design — the store ESLint has no React plugin, so a
// JSX-only sub-component reference would trip no-unused-vars.

export default function AccountNav() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let active = true
    fetchCurrentUser()
      .then((u) => {
        if (active) setUser(u)
      })
      .catch(() => {
        // fetchCurrentUser only throws on unexpected (non-API) errors; treat
        // as logged out.
        if (active) setUser(null)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <a
      className="site-icon"
      href={user ? '/account' : '/login'}
      aria-label={user ? `Account — ${accountLabel(user)}` : 'Sign in'}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="12.5" cy="6.5" r="3.5" />
        <path d="M4 21V16C4 14.8954 4.89543 14 6 14H19C20.1046 14 21 14.8954 21 16V21" strokeLinecap="round" />
      </svg>
    </a>
  )
}
