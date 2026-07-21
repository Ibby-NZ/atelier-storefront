// Auth helpers shared by the header island and the account/auth pages.
//
// The API session is a signed HttpOnly cookie (set by atelier-api on
// register/login, cleared on logout). The browser can't read it, so "am I
// logged in?" is answered by calling GET /auth/me, which returns { user } or
// 401. All calls go through src/lib/api.js so the base URL and credentials
// (`credentials: 'include'`, needed for the cookie) stay in one place.

import { apiFetch, ApiError } from './api.js'

// Returns the current user object, or null when not logged in (401) or the API
// is unreachable. Never throws — callers render a logged-out state on null.
export async function fetchCurrentUser() {
  try {
    const body = await apiFetch('/auth/me')
    return body?.user ?? null
  } catch (err) {
    if (err instanceof ApiError) return null
    throw err
  }
}

// Clears the server session cookie. Returns true on success, false otherwise
// (never throws) so the caller can still redirect / reset local UI.
export async function logout() {
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
