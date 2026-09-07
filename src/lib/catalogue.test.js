import test from 'node:test'
import assert from 'node:assert/strict'
import {
  priceInfo,
  NO_PRICE_COPY,
  productSummary,
  weaveBackground,
  toneList,
  categoryLabel,
  productClassLabel,
  CATEGORY_LABELS,
  priceBandFor,
  visiblePriceCents,
} from './catalogue.js'

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

// --- the merchandising category -------------------------------------------

test('a category is labelled, and a storage spelling is never shown raw', () => {
  assert.equal(categoryLabel('bed-linen'), 'Bed linen')
  assert.equal(categoryLabel('throw'), 'Throw')
  assert.equal(categoryLabel('misc'), 'Miscellaneous')
  for (const value of Object.keys(CATEGORY_LABELS)) {
    assert.ok(categoryLabel(value), `${value} has no label`)
  }
})

test('an unknown category falls back to its raw value, never to blank', () => {
  // The storefront and the API deploy separately, so this build can be behind
  // the vocabulary. Blank would read as "uncategorised" while quietly hiding a
  // whole facet whose counts still agreed with themselves.
  assert.equal(categoryLabel('curtain'), 'curtain')
})

test('blank means genuinely uncategorised — most of the catalogue', () => {
  assert.equal(categoryLabel(null), '')
  assert.equal(categoryLabel(undefined), '')
  assert.equal(categoryLabel(''), '')
})

test('the class label prefers the category and never prints both', () => {
  // For every fabric the two are the same word, so the pair reads
  // "Fabric · Fabric"; where they differ the type is the half a shopper has no
  // use for (a cushion and a throw are both finished goods).
  assert.equal(
    productClassLabel({ product_type: 'finished_good', category: 'cushion' }),
    'Cushion'
  )
  assert.equal(productClassLabel({ product_type: 'fabric', category: 'fabric' }), 'Fabric')
})

test('the class label falls back to the product type while a design is uncategorised', () => {
  assert.equal(productClassLabel({ product_type: 'finished_good', category: null }), 'Finished good')
  assert.equal(productClassLabel({ product_type: 'fabric' }), 'Fabric')
  assert.equal(productClassLabel(null), '')
})

test('visiblePriceCents: trade first, then a visible retail figure, else null', () => {
  assert.equal(visiblePriceCents({ trade_price_cents: 18776, retail_price_cents: 25000 }), 18776)
  assert.equal(visiblePriceCents({ price_hidden: false, retail_price_cents: 25000 }), 25000)
  assert.equal(visiblePriceCents({ price_hidden: true, retail_price_cents: 25000 }), null)
  assert.equal(visiblePriceCents({ price_hidden: false, retail_price_cents: null }), null)
  assert.equal(visiblePriceCents(null), null)
})

test('priceBandFor: the office bands — under 100, 100–200, 201–300, …', () => {
  assert.equal(priceBandFor(null), null)
  assert.equal(priceBandFor(undefined), null)
  assert.deepEqual(priceBandFor(0), { value: 'under-100', label: 'Under $100', from: 0 })
  assert.deepEqual(priceBandFor(9999), { value: 'under-100', label: 'Under $100', from: 0 })
  assert.deepEqual(priceBandFor(10000), { value: '100-200', label: '$100–$200', from: 100 })
  assert.deepEqual(priceBandFor(20000), { value: '100-200', label: '$100–$200', from: 100 })
  assert.deepEqual(priceBandFor(20050), { value: '201-300', label: '$201–$300', from: 201 })
  assert.deepEqual(priceBandFor(30000), { value: '201-300', label: '$201–$300', from: 201 })
  assert.deepEqual(priceBandFor(30100), { value: '301-400', label: '$301–$400', from: 301 })
  assert.deepEqual(priceBandFor(48600), { value: '401-500', label: '$401–$500', from: 401 })
  assert.deepEqual(priceBandFor(100000), { value: '901-1000', label: '$901–$1,000', from: 901 })
  assert.deepEqual(priceBandFor(123456), { value: '1201-1300', label: '$1,201–$1,300', from: 1201 })
})
