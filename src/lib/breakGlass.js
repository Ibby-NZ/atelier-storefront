// Break-glass sign-in — the emergency way into the store's account area when
// atelier-api is unreachable or its database is down.
//
// BE HONEST ABOUT WHAT THIS BUYS YOU. The storefront's pages are prerendered,
// so with the API flat the site still BROWSES perfectly: every product, house
// and collection page is static HTML baked at build time. What needs the API is
// exactly the part a local session cannot fake — orders, cart, checkout, trade
// pricing. So a break-glass session here unlocks a labelled shell, nothing more:
// it stops /account bouncing to /login and says plainly that the service is
// down. It is far more useful in the CRM, whose demo screens run off local data.
// Enable it here only if a labelled shell is worth a public credential to you.
//
// SECURITY POSTURE — read this before changing anything here.
//   * The digest below is compiled into the JavaScript bundle and is therefore
//     PUBLIC, and this is a PUBLIC site. Anyone can read it and grind it
//     offline. One unsalted SHA-256 is not a password KDF. That is survivable
//     only because the passphrase is long and random — four dictionary words
//     plus digits is ~10^20 guesses. NEVER set this to a human-chosen password,
//     and never reuse a passphrase that opens anything else.
//   * The blast radius of a crack is "can see an empty, offline-labelled account
//     page" — no order, no address, no price. It authenticates nobody: it sets
//     no API cookie, so /orders/mine and every other endpoint still refuse it.
//   * It is OFF unless both env vars are set at build time. An unconfigured
//     build has no bypass, not a weak one.
//   * It is only offered after a live sign-in attempt has actually failed
//     unreachably (see isApiUnreachable). That is a footgun guard, not a
//     security control.
//   * The session lives in sessionStorage: it dies with the tab, and expires on
//     its own after SESSION_MAX_AGE_MS.
//
// Rotating the credential: change the env var, rebuild, redeploy. Live
// break-glass sessions are invalidated automatically because readSession
// re-checks the stored email against the configured one.

import { sha256Hex, digestsMatch } from './sha256.js'

export const BREAK_GLASS_STORAGE_KEY = 'atelier_store_break_glass'

// A forgotten tab should not stay a standing bypass for a week.
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

const SHA256_HEX = /^[0-9a-f]{64}$/

export const OFFLINE_WRITE_MESSAGE =
  'The store service is offline — this cannot be submitted right now. Please try again shortly.'

// Normalise + validate the build-time configuration. Returns null (feature off)
// unless BOTH an email and a well-formed 64-character digest are present, so a
// half-filled .env can never produce a bypass that accepts an empty password.
export function readBreakGlassConfig(raw) {
  if (!raw || typeof raw !== 'object') return null
  const email = String(raw.email ?? '').trim().toLowerCase()
  const passwordHash = String(raw.passwordHash ?? '').trim().toLowerCase()
  if (!email || !SHA256_HEX.test(passwordHash)) return null
  const name = String(raw.name ?? '').trim() || 'Offline access'
  return Object.freeze({ email, passwordHash, name })
}

// "The API did not answer" — a transport failure (ApiError status 0) or the
// server itself falling over (5xx, which is what a dead database looks like
// from out here). A 401/403/422 is the API working correctly and must NOT open
// the emergency door.
export function isApiUnreachable(error) {
  const status = error?.status
  if (typeof status !== 'number') return false
  return status === 0 || status >= 500
}

// Constant-time-ish credential check. The email is compared case-insensitively
// (it is an identifier, not a secret); the passphrase is compared as digests.
export function verifyBreakGlass(config, { email, password } = {}) {
  if (!config) return false
  if (String(email ?? '').trim().toLowerCase() !== config.email) return false
  if (typeof password !== 'string' || password === '') return false
  return digestsMatch(sha256Hex(password), config.passwordHash)
}

// sessionStorage, or null where it is unavailable (prerendering runs in Node,
// and a browser may have storage blocked). Callers treat null as "break-glass
// not possible".
export function browserStorage() {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function sessionFrom(config, startedAt) {
  return { v: 1, email: config.email, name: config.name, startedAt }
}

export function startBreakGlassSession(storage, config, now = Date.now()) {
  if (!storage || !config) return null
  const session = sessionFrom(config, now)
  try {
    storage.setItem(BREAK_GLASS_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage full or blocked — the caller still gets a session for this page
    // view; it simply will not survive a reload.
  }
  return session
}

// Returns the stored session, or null. Null whenever anything is off: no
// config (the feature was turned off or the credential rotated), a different
// email, malformed JSON, or past SESSION_MAX_AGE_MS. A rejected session is
// cleared so it cannot be re-evaluated on every page view.
export function readBreakGlassSession(storage, config, now = Date.now()) {
  if (!storage) return null
  let raw
  try {
    raw = storage.getItem(BREAK_GLASS_STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }

  const valid =
    config
    && parsed
    && parsed.v === 1
    && parsed.email === config.email
    && Number.isFinite(parsed.startedAt)
    && now - parsed.startedAt >= 0
    && now - parsed.startedAt < SESSION_MAX_AGE_MS

  if (!valid) {
    endBreakGlassSession(storage)
    return null
  }
  return { v: 1, email: parsed.email, name: config.name, startedAt: parsed.startedAt }
}

export function endBreakGlassSession(storage) {
  if (!storage) return
  try {
    storage.removeItem(BREAK_GLASS_STORAGE_KEY)
  } catch {
    /* nothing to do — the session is already unusable to us */
  }
}
