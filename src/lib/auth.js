// Auth helpers shared by the header island and the account/auth pages.
//
// The API session is a signed HttpOnly cookie (set by atelier-api on
// register/login, cleared on logout). The browser can't read it, so "am I
// logged in?" is answered by calling GET /auth/me, which returns { user } or
// 401. All calls go through src/lib/api.js so the base URL and credentials
// (`credentials: 'include'`, needed for the cookie) stay in one place.

// A break-glass session (./breakGlass.js) is the second, emergency source of a
// user here: local-only, no API cookie, and marked `offline: true` so every
// caller can say so rather than render a broken-looking empty account.

import { apiFetch, ApiError } from './api.js'
import { BREAK_GLASS } from './breakGlassConfig.js'
import {
  browserStorage,
  readBreakGlassSession,
  endBreakGlassSession,
} from './breakGlass.js'

// The stored break-glass session drawn as a user, or null. Role is `customer`
// with no trade approval: this account is entitled to nothing, and pretending
// otherwise would show trade pricing that the API would never actually serve.
export function readOfflineUser() {
  const session = readBreakGlassSession(browserStorage(), BREAK_GLASS)
  if (!session) return null
  return {
    id: 'break-glass',
    name: session.name,
    email: session.email,
    role: 'customer',
    trade_approved: false,
    offline: true,
  }
}

// Returns the current user object, or null when not logged in (401) or the API
// is unreachable. Never throws — callers render a logged-out state on null.
// A real API session always wins; a break-glass one is only consulted when the
// API produced no user, whatever the reason.
export async function fetchCurrentUser() {
  try {
    const body = await apiFetch('/auth/me')
    if (body?.user) return body.user
  } catch (err) {
    if (!(err instanceof ApiError)) throw err
  }
  return readOfflineUser()
}

// Clears the server session cookie. Returns true on success, false otherwise
// (never throws) so the caller can still redirect / reset local UI.
// The local break-glass session is dropped FIRST — both because it must go
// regardless of what the network does, and because clearing it is what lets the
// logout request past api.js's offline write guard.
export async function logout() {
  endBreakGlassSession(browserStorage())
  try {
    await apiFetch('/auth/logout', { method: 'POST' })
    return true
  } catch {
    return false
  }
}

// Display label for a signed-in user: their name when set, else the email.
export function accountLabel(user) {
  if (!user) return ''
  return user.name?.trim() ? user.name : user.email
}
