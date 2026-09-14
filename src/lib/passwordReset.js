// The pure half of the two reset screens, and of the account panel's password
// change. Mirrors the API's floor (MIN_PASSWORD_LENGTH in atelier-api
// src/auth/passwords.js) so a short password is refused with a sentence rather
// than the raw schema 400.
export const MIN_PASSWORD_LENGTH = 12

export const FORGOT_PASSWORD_PATH = '/forgot-password'
export const RESET_PASSWORD_PATH = '/reset-password'

// The token rides in ?token= on the emailed link. Empty when absent.
export function readResetToken(search) {
  return new URLSearchParams(search || '').get('token')?.trim() || ''
}

// '' when the pair is acceptable, otherwise the sentence to show.
export function newPasswordError(password, confirm) {
  if (!password) return 'Choose a new password.'
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirm) return 'The two passwords do not match.'
  return ''
}

// The guard's 401 body (atelier-api src/auth/guards.js). The route can answer
// 401 for two unrelated reasons and this sentence is the only one on the wire
// that means "not signed in" — no cookie, an invalid one, or an account since
// archived or de-approved.
const NOT_SIGNED_IN = 'Authentication required.'

/**
 * What to show when POST /auth/change-password fails.
 *
 * The other 401 is the wrong current password, and the API words it itself
 * ('Your current password is not correct.'), as api.js prefers the body's
 * sentence over its generic "Please log in to view this". So the only rewrite
 * needed is the guard's: on a page you are demonstrably signed in to,
 * "Authentication required." has to say what to do about it. Matching the
 * guard rather than the password branch fails safe — an API rewording leaves a
 * true-but-blunt sentence on screen instead of blaming a correct password.
 *
 * @param {{ status?: number, message?: string, body?: { error?: string }|null }|null} error  an ApiError
 */
export function changePasswordError(error) {
  if (error?.status === 401 && error.body?.error === NOT_SIGNED_IN) {
    return 'Your session has ended. Please sign in again and retry.'
  }
  return error?.message || 'Something went wrong. Please try again.'
}
