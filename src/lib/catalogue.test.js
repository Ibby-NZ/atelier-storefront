import test from 'node:test'
import assert from 'node:assert/strict'
import { priceInfo, NO_PRICE_COPY, productSummary, weaveBackground, toneList } from './catalogue.js'

const GUEST = null
const CUSTOMER = { role: 'customer', trade_approved: false }
const PENDING_TRADE = { role: 'trade', trade_approved: false }
const APPROVED_TRADE = { role: 'trade', trade_approved: true }

// An international house: retail hidden from everyone (FR-3).
const hidden = (extra = {}) => ({
  name: 'Atlas',
  currency: 'EUR',
  price_hidden: true,
  retail_price_cents: null,
  ...extra,
})

// The house brand: a real, public retail price.
const domestic = (extra = {}) => ({
  name: 'Galata towels',
  currency: 'NZD',
  price_hidden: false,
  retail_price_cents: 12900,
  ...extra,
})

test('trade price wins, and is always formatted in NZD, not the supplier currency', () => {
  const info = priceInfo(hidden({ trade_price_cents: 18776 }), APPROVED_TRADE)
  assert.equal(info.label, 'Trade')
  assert.equal(info.text, '$187.76')
  assert.equal(info.muted, false)
  // Retail is hidden here, so there is nothing to strike through.
  assert.equal(info.retail, null)
})

test('a visible retail price is struck through beside the trade price', () => {
  const info = priceInfo(domestic({ trade_price_cents: 9900 }), APPROVED_TRADE)
  assert.equal(info.text, '$99.00')
  assert.equal(info.retail, '$129.00')
})

test('a guest with no visible price is invited to sign in', () => {
  assert.equal(priceInfo(hidden(), GUEST).text, NO_PRICE_COPY.guest)
  assert.match(priceInfo(hidden(), GUEST).text, /sign in/i)
})

// The bug this guards: priceInfo used to take the product alone, so every
// signed-in shopper was told to "Sign in for trade pricing" — on the seeded
// catalogue that is 32 of 48 products for an APPROVED trade account, which
// reads as "your trade account does not work".
test('a signed-in shopper is never told to sign in', () => {
  for (const viewer of [CUSTOMER, PENDING_TRADE, APPROVED_TRADE]) {
    const { text } = priceInfo(hidden(), viewer)
    assert.doesNotMatch(text, /sign in/i, `viewer ${viewer.role}/${viewer.trade_approved}`)
  }
})

test('a pending applicant is told approval is what is missing', () => {
  const { text } = priceInfo(hidden(), PENDING_TRADE)
  assert.equal(text, NO_PRICE_COPY.pending)
  assert.match(text, /approv/i)
})

test('an approved trade user sees "price on request" where there is no trade figure', () => {
  // 36 of the 48 seeded products are finished goods, which carry no trade price.
  assert.equal(priceInfo(hidden(), APPROVED_TRADE).text, NO_PRICE_COPY.signedIn)
  assert.equal(priceInfo(hidden(), CUSTOMER).text, NO_PRICE_COPY.signedIn)
})

test('a visible retail price renders for everyone, viewer or not', () => {
  for (const viewer of [GUEST, CUSTOMER, PENDING_TRADE, APPROVED_TRADE]) {
    const info = priceInfo(domestic(), viewer)
    assert.equal(info.text, '$129.00')
    assert.equal(info.label, '')
    assert.equal(info.indicative, true)
  }
})

test('the viewer argument is optional and defaults to the guest view', () => {
  assert.equal(priceInfo(hidden()).text, NO_PRICE_COPY.guest)
  assert.equal(priceInfo(domestic()).text, '$129.00')
})

test('a missing product yields empty copy rather than throwing', () => {
  assert.equal(priceInfo(null, APPROVED_TRADE).text, '')
  assert.equal(priceInfo(undefined).text, '')
})

test('productSummary never leaks a price', () => {
  const summary = productSummary({
    name: 'Atlas',
    brand: { name: 'Pierre Frey' },
    application: 'Upholstery',
    composition: '100% linen',
    width: '140cm',
    product_type: 'fabric',
    retail_price_cents: 12900,
  })
  assert.match(summary, /Atlas by Pierre Frey/)
  assert.doesNotMatch(summary, /\d+\.\d\d|\$/)
})

test('weaveBackground and toneList tolerate junk hex_tones', () => {
  assert.deepEqual(toneList(null), [])
  assert.deepEqual(toneList('#fff'), [])
  assert.equal(weaveBackground([]), undefined)
  assert.match(weaveBackground(['#aabbcc', '#112233']), /linear-gradient/)
})
