import { useEffect, useState } from 'react'
import { fetchCurrentUser, logout, accountLabel } from '../lib/auth.js'

// Header account island (US-021). The site is a static build, so login state
// isn't known at build time — this client:load island resolves it at runtime
// via GET /auth/me. Logged in: shows the account name (link to /account) and a
// Log out button. Logged out: a plain Login link. While the first /auth/me is
// in flight it shows the Login link so there's no layout jump for the common
// (guest) case; it swaps to the name once the user resolves.
//
// Staff also get an Admin link to the back-office hub. It is only a shortcut —
// every admin page gates on the user itself, so hiding the link is convenience,
// not access control.
//
// Single component by design — the store ESLint has no React plugin, so a
// JSX-only sub-component reference would trip no-unused-vars.
function isBackoffice(user) {
  return user?.role === 'backoffice' || user?.role === 'director'
}

export default function AccountNav() {
  const [user, setUser] = useState(null)
  const [busy, setBusy] = useState(false)

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

  async function handleLogout() {
    setBusy(true)
    await logout()
    // Full reload so every island (cart aside, account link) re-reads state.
    if (typeof window !== 'undefined') window.location.href = '/'
  }

  if (!user) {
    return (
      <a className="account-nav" href="/login">
        Login
      </a>
    )
  }

  return (
    <span className="account-nav account-nav-signed-in">
      {isBackoffice(user) && <a href="/admin/">Admin</a>}
      <a href="/account">{accountLabel(user)}</a>
      <button
        type="button"
        className="account-logout"
        onClick={handleLogout}
        disabled={busy}
      >
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    </span>
  )
}
