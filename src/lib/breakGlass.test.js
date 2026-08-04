import test from 'node:test'
import assert from 'node:assert/strict'
import { sha256Hex, digestsMatch } from './sha256.js'
import {
  BREAK_GLASS_STORAGE_KEY,
  SESSION_MAX_AGE_MS,
  readBreakGlassConfig,
  isApiUnreachable,
  verifyBreakGlass,
  startBreakGlassSession,
  readBreakGlassSession,
  endBreakGlassSession,
} from './breakGlass.js'

// Long and random is the whole security argument for shipping the digest
// publicly — a human-chosen password here would be cracked in seconds.
const PASSPHRASE = 'vellum-thistle-quarry-gantry-8846'
const DIGEST = '4aeefc5d4aaaaf8dac8ae87bc9353278b84f9f3b14f8bdd49ccd7da1e3f8074c'

const config = readBreakGlassConfig({
  email: 'Recovery@ateliertextiles.co.nz',
  passwordHash: DIGEST,
  name: 'Offline access',
})

// Minimal sessionStorage stand-in — these tests run in Node, which has none.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

test('sha256Hex matches the published FIPS 180-4 vectors', () => {
  assert.equal(sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('sha256Hex handles inputs that straddle the 64-byte block boundary', () => {
  // 55/56 bytes is where the length field stops fitting in the final block — an
  // off-by-one in the padding shows up here and nowhere else.
  assert.equal(sha256Hex('x'.repeat(55)),
    'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072')
  assert.equal(sha256Hex('x'.repeat(56)),
    '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e')
})

test('digestsMatch is false for different or differently-sized digests', () => {
  assert.equal(digestsMatch(DIGEST, DIGEST), true)
  assert.equal(digestsMatch(DIGEST, DIGEST.replace(/.$/, '0')), false)
  assert.equal(digestsMatch(DIGEST, DIGEST.slice(0, 63)), false)
  assert.equal(digestsMatch(null, DIGEST), false)
})

test('the feature is off unless both an email and a 64-char digest are supplied', () => {
  assert.equal(readBreakGlassConfig(null), null)
  assert.equal(readBreakGlassConfig({}), null)
  assert.equal(readBreakGlassConfig({ email: 'a@b.c' }), null)
  assert.equal(readBreakGlassConfig({ passwordHash: DIGEST }), null)
  // A truncated or non-hex digest is a misconfiguration, not a weak password.
  assert.equal(readBreakGlassConfig({ email: 'a@b.c', passwordHash: DIGEST.slice(0, 32) }), null)
  assert.equal(readBreakGlassConfig({ email: 'a@b.c', passwordHash: 'not-a-digest' }), null)
})

test('config normalises the email and digest, and defaults the display name', () => {
  const c = readBreakGlassConfig({ email: '  Recovery@X.CO.NZ ', passwordHash: DIGEST.toUpperCase() })
  assert.equal(c.email, 'recovery@x.co.nz')
  assert.equal(c.passwordHash, DIGEST)
  assert.equal(c.name, 'Offline access')
})

test('isApiUnreachable is true only for a transport failure or a server collapse', () => {
  assert.equal(isApiUnreachable({ status: 0 }), true)     // fetch threw
  assert.equal(isApiUnreachable({ status: 500 }), true)
  assert.equal(isApiUnreachable({ status: 503 }), true)   // database down
})

test('isApiUnreachable is false when the API answered — a bad password is not an outage', () => {
  for (const status of [401, 403, 404, 422, 429]) {
    assert.equal(isApiUnreachable({ status }), false, `status ${status}`)
  }
  assert.equal(isApiUnreachable(new Error('boom')), false)
  assert.equal(isApiUnreachable(null), false)
})

test('verifyBreakGlass accepts the configured pair, ignoring email case and space', () => {
  assert.equal(verifyBreakGlass(config, { email: 'recovery@ateliertextiles.co.nz', password: PASSPHRASE }), true)
  assert.equal(verifyBreakGlass(config, { email: '  RECOVERY@ateliertextiles.co.nz  ', password: PASSPHRASE }), true)
})

test('verifyBreakGlass rejects a wrong passphrase, a wrong email and an empty password', () => {
  assert.equal(verifyBreakGlass(config, { email: 'recovery@ateliertextiles.co.nz', password: 'wrong' }), false)
  assert.equal(verifyBreakGlass(config, { email: 'someone@else.co.nz', password: PASSPHRASE }), false)
  assert.equal(verifyBreakGlass(config, { email: 'recovery@ateliertextiles.co.nz', password: '' }), false)
  assert.equal(verifyBreakGlass(config, {}), false)
})

test('verifyBreakGlass rejects everything when the feature is not configured', () => {
  assert.equal(verifyBreakGlass(null, { email: 'recovery@ateliertextiles.co.nz', password: PASSPHRASE }), false)
})

test('the offline session round-trips through storage', () => {
  const storage = fakeStorage()
  const started = startBreakGlassSession(storage, config, 1000)
  assert.equal(started.email, config.email)
  const read = readBreakGlassSession(storage, config, 2000)
  assert.equal(read.email, config.email)
  assert.equal(read.startedAt, 1000)
})

test('the offline session expires on its own, and clears itself when it does', () => {
  const storage = fakeStorage()
  startBreakGlassSession(storage, config, 0)
  assert.notEqual(readBreakGlassSession(storage, config, SESSION_MAX_AGE_MS - 1), null)
  assert.equal(readBreakGlassSession(storage, config, SESSION_MAX_AGE_MS), null)
  assert.equal(storage.getItem(BREAK_GLASS_STORAGE_KEY), null)
})

test('the offline session is void once the credential is rotated or switched off', () => {
  const rotated = readBreakGlassConfig({ email: 'new-recovery@ateliertextiles.co.nz', passwordHash: DIGEST })

  const a = fakeStorage()
  startBreakGlassSession(a, config, 1000)
  assert.equal(readBreakGlassSession(a, rotated, 2000), null)

  const b = fakeStorage()
  startBreakGlassSession(b, config, 1000)
  assert.equal(readBreakGlassSession(b, null, 2000), null)
})

test('a hand-written or corrupted storage entry is ignored', () => {
  assert.equal(readBreakGlassSession(fakeStorage({ [BREAK_GLASS_STORAGE_KEY]: '{ not json' }), config), null)
  // Forging the payload does not help: the email must match the build's own.
  const forged = JSON.stringify({ v: 1, email: 'attacker@example.com', startedAt: Date.now() })
  assert.equal(readBreakGlassSession(fakeStorage({ [BREAK_GLASS_STORAGE_KEY]: forged }), config), null)
  // A future-dated session is not a way to extend the window either.
  const future = JSON.stringify({ v: 1, email: config.email, startedAt: 10000 })
  assert.equal(readBreakGlassSession(fakeStorage({ [BREAK_GLASS_STORAGE_KEY]: future }), config, 1000), null)
})

test('absent storage means "no emergency access"', () => {
  assert.equal(startBreakGlassSession(null, config), null)
  assert.equal(readBreakGlassSession(null, config), null)
  assert.doesNotThrow(() => endBreakGlassSession(null))
})

test('signing out removes the offline session', () => {
  const storage = fakeStorage()
  startBreakGlassSession(storage, config, 1000)
  endBreakGlassSession(storage)
  assert.equal(readBreakGlassSession(storage, config, 1100), null)
})
