import test from 'node:test'
import assert from 'node:assert/strict'
import {
  houseDesignsHref,
  isTradeGateError,
  isTradeGatedList,
  signInHref,
  LOGIN_PATH,
  TRADE_APPLICATION_PATH,
  TRADE_GATE_COPY,
  TRADE_GATE_PAGE,
} from './tradeGate.js'

// The shape lib/api.js throws for a gated design: ApiError carries .status and
// the parsed .body. Plain objects here — tradeGate.js is duck-typed precisely so
// this file never has to import the fetch helper.
const gateError = (extra = {}) => ({
  status: 403,
  body: { error: 'This design is part of our trade library.', trade_only: true },
  ...extra,
})

test('a 403 carrying trade_only is the gate', () => {
  assert.equal(isTradeGateError(gateError()), true)
})

// The distinction the product page turns on. A 404 must stay a 404 (the slug is
// genuinely gone) and any other failure must stay an outage — treating either as
// the gate would invite a shopper to apply for a trade account to fix a typo or
// a dead API.
test('a 404, an outage and a bare 403 are all NOT the gate', () => {
  assert.equal(isTradeGateError({ status: 404, body: { error: 'Product not found.' } }), false)
  assert.equal(isTradeGateError({ status: 0, body: null }), false)
  assert.equal(isTradeGateError({ status: 500, body: null }), false)
  // A 403 from anything else — an admin route, a role check — carries no flag.
  assert.equal(isTradeGateError({ status: 403, body: { error: 'Forbidden.' } }), false)
  assert.equal(isTradeGateError({ status: 403, body: null }), false)
  // A 404 that somehow carried the flag is still a 404: the status leads.
  assert.equal(isTradeGateError({ status: 404, body: { trade_only: true } }), false)
})

test('the flag is read strictly, and a missing error never throws', () => {
  assert.equal(isTradeGateError(gateError({ body: { trade_only: 'true' } })), false)
  assert.equal(isTradeGateError(null), false)
  assert.equal(isTradeGateError(undefined), false)
  assert.equal(isTradeGateError(new Error('network')), false)
})

test('meta.trade_gated tells the grid it is holding the public subset', () => {
  assert.equal(isTradeGatedList({ products: [], meta: { trade_gated: true } }), true)
  assert.equal(isTradeGatedList({ products: [], meta: { trade_gated: false } }), false)
})

// Silence is the safe failure here: announcing "you are seeing part of the
// library" to an entitled shopper, or against an API that never sent the field,
// is worse than saying nothing.
test('an absent or unparsed body is not gated', () => {
  assert.equal(isTradeGatedList({ products: [], meta: {} }), false)
  assert.equal(isTradeGatedList({ products: [] }), false)
  assert.equal(isTradeGatedList(null), false)
  assert.equal(isTradeGatedList(undefined), false)
})

test('sign-in carries the shopper back to where they were gated', () => {
  assert.equal(signInHref('/products/pierre-frey-atlas'), `${LOGIN_PATH}?redirect=%2Fproducts%2Fpierre-frey-atlas`)
  assert.equal(signInHref('/products'), `${LOGIN_PATH}?redirect=%2Fproducts`)
})

// LoginForm refuses these values, so putting one in a href would only produce a
// link that lands home with no explanation.
test('an off-site or missing return path degrades to a plain sign-in', () => {
  assert.equal(signInHref('//evil.example/phish'), LOGIN_PATH)
  assert.equal(signInHref('https://evil.example'), LOGIN_PATH)
  assert.equal(signInHref('products'), LOGIN_PATH)
  assert.equal(signInHref(''), LOGIN_PATH)
  assert.equal(signInHref(), LOGIN_PATH)
  assert.equal(signInHref(null), LOGIN_PATH)
})

// Every block is heading + body + its own actions. The actions differ by
// audience and that is the point: a shopper who is ALREADY through the gate must
// not be offered "apply" or "sign in", which is exactly the bug the entitled
// block exists to fix.
const ACTIONS_BY_BLOCK = {
  library: ['apply', 'signIn'],
  design: ['apply', 'signIn'],
  house: ['apply', 'signIn'],
  houseEntitled: ['browse'],
}

test('every surface has a heading, a body and the actions its audience needs', () => {
  // Fails if a block is added without deciding what it offers, rather than
  // silently going unchecked.
  assert.deepEqual(
    Object.keys(TRADE_GATE_COPY).sort(),
    Object.keys(ACTIONS_BY_BLOCK).sort()
  )

  for (const [name, block] of Object.entries(TRADE_GATE_COPY)) {
    for (const field of ['heading', 'body', ...ACTIONS_BY_BLOCK[name]]) {
      assert.equal(typeof block[field], 'string', `${name}.${field}`)
      assert.ok(block[field].trim().length > 0, `${name}.${field} is empty`)
    }
    assert.ok(Object.isFrozen(block), `${name} must be frozen`)
  }
  assert.ok(TRADE_GATE_PAGE.title.includes('Atelier Textiles'))
  assert.ok(TRADE_GATE_PAGE.description.trim().length > 0)
})

// An entitled shopper is signed in and approved. Telling them to apply, or to
// sign in, is the dead end this block was added to remove.
test('the entitled note never asks for an account or a sign-in', () => {
  const copy = Object.values(TRADE_GATE_COPY.houseEntitled).join(' ')
  assert.doesNotMatch(copy, /apply|sign in/i)
  assert.equal(TRADE_GATE_COPY.houseEntitled.apply, undefined)
  assert.equal(TRADE_GATE_COPY.houseEntitled.signIn, undefined)
})

test('the house grid link is the library filtered to that house', () => {
  assert.equal(houseDesignsHref('pierre-frey'), '/products?brand=pierre-frey')
  // A slug is server-generated and URL-safe, but the escaping is not optional:
  // this value lands in a href.
  assert.equal(houseDesignsHref('c&c milano'), '/products?brand=c%26c%20milano')
  assert.equal(houseDesignsHref(''), '/products?brand=')
  assert.equal(houseDesignsHref(undefined), '/products?brand=')
})

// The storefront no longer offers a standard-customer account (register.astro
// and RegisterForm.jsx are gone), so no gate copy may send a shopper looking for
// one. This is the regression guard for that removal.
test('no copy offers an account the storefront cannot create', () => {
  const everything = [
    ...Object.values(TRADE_GATE_COPY).flatMap((block) => Object.values(block)),
    TRADE_GATE_PAGE.title,
    TRADE_GATE_PAGE.description,
  ].join(' ')
  assert.doesNotMatch(everything, /standard account|create an account|register/i)
})

test('the two destinations are the real routes', () => {
  assert.equal(TRADE_APPLICATION_PATH, '/trade-application')
  assert.equal(LOGIN_PATH, '/login')
})
