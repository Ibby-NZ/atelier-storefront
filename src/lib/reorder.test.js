import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toRequestLines,
  toCartLines,
  reorderPlan,
  canReorder,
  hasQuotedTotal,
} from './reorder.js'

const fabricLine = (overrides = {}) => ({
  sku: 'PF-ATLAS-01',
  product_name: 'Atlas',
  slug: 'pierre-frey-atlas',
  product_type: 'fabric',
  brand_name: 'Pierre Frey',
  colourway_name: 'Ecru',
  lead_time: '6 weeks',
  qty: '12.50',
  unit_price_cents: 0,
  cut_requirements: 'One continuous cut',
  ...overrides,
})

const goodLine = (overrides = {}) => ({
  sku: 'ATNZ-CUSH-01',
  product_name: 'Linen cushion',
  slug: 'linen-cushion',
  product_type: 'finished_good',
  brand_name: 'Atelier Textiles NZ',
  colourway_name: 'Ecru',
  lead_time: null,
  qty: '2',
  unit_price_cents: 12500,
  cut_requirements: null,
  ...overrides,
})

const order = (lines, overrides = {}) => ({
  order_number: 'REQ-TEST',
  kind: 'order_request',
  status: 'quote_requested',
  total_cents: 0,
  lines,
  ...overrides,
})

test('toRequestLines maps a fabric line onto the request-list shape', () => {
  const [line] = toRequestLines(order([fabricLine()]))
  assert.deepEqual(line, {
    sku: 'PF-ATLAS-01',
    slug: 'pierre-frey-atlas',
    name: 'Atlas',
    brand: 'Pierre Frey',
    colourway: 'Ecru',
    image_url: null,
    in_stock: false,
    lead_time: '6 weeks',
    metres: 12.5,
    cut_requirements: 'One continuous cut',
  })
})

test('toRequestLines never carries stock state forward', () => {
  // What was in stock when the order was placed says nothing about today, and
  // `false` is the safe direction (it shows the lead-time checkbox).
  const [line] = toRequestLines(order([fabricLine({ in_stock: true })]))
  assert.equal(line.in_stock, false)
})

test('toRequestLines coerces the pg numeric string, and never yields zero metres', () => {
  assert.equal(toRequestLines(order([fabricLine({ qty: '0.75' })]))[0].metres, 0.75)
  // A zero-metre line would be rejected by the API and read as a dropped line.
  assert.equal(toRequestLines(order([fabricLine({ qty: '0' })]))[0].metres, 1)
  assert.equal(toRequestLines(order([fabricLine({ qty: null })]))[0].metres, 1)
})

test('toRequestLines ignores finished goods and lines with no SKU', () => {
  const lines = toRequestLines(order([fabricLine(), goodLine(), fabricLine({ sku: null })]))
  assert.equal(lines.length, 1)
})

test('toCartLines maps a finished good onto the cart shape', () => {
  const [line] = toCartLines(order([goodLine()]))
  assert.deepEqual(line, {
    sku: 'ATNZ-CUSH-01',
    slug: 'linen-cushion',
    name: 'Linen cushion',
    price_cents: 12500,
    currency: 'NZD',
    qty: 2,
  })
})

test('toCartLines floors a fractional quantity to at least one unit', () => {
  assert.equal(toCartLines(order([goodLine({ qty: '1.7' })]))[0].qty, 1)
  assert.equal(toCartLines(order([goodLine({ qty: '0' })]))[0].qty, 1)
})

test('reorderPlan splits a mixed order and lands on the request list', () => {
  // The cut request is the half that needs a human, so it wins the redirect.
  const plan = reorderPlan(order([fabricLine(), goodLine()]))
  assert.deepEqual(plan, { fabric: 1, goods: 1, total: 2, destination: '/order-request' })
})

test('reorderPlan sends a finished-goods-only order to the cart', () => {
  const plan = reorderPlan(order([goodLine()]))
  assert.deepEqual(plan, { fabric: 0, goods: 1, total: 1, destination: '/cart' })
})

test('reorderPlan has no destination for an order with nothing reorderable', () => {
  assert.equal(reorderPlan(order([])).destination, null)
  assert.equal(canReorder(order([])), false)
  assert.equal(canReorder(order([fabricLine()])), true)
  // An order object with no lines array at all must not throw.
  assert.equal(canReorder({}), false)
  assert.equal(canReorder(null), false)
})

test('hasQuotedTotal is false for the placeholder zero a fabric request carries', () => {
  assert.equal(hasQuotedTotal(order([fabricLine()], { total_cents: 0 })), false)
  assert.equal(hasQuotedTotal(order([fabricLine()], { total_cents: null })), false)
  assert.equal(hasQuotedTotal(null), false)
})

test('hasQuotedTotal stays false once a zero-total order is invoiced or shipped', () => {
  // The regression this guards: keying on status instead of the total puts
  // $0.00 back on exactly the orders a client is most likely to open.
  for (const status of ['pending_payment', 'paid', 'shipped']) {
    assert.equal(hasQuotedTotal(order([fabricLine()], { status, total_cents: 0 })), false)
  }
})

test('hasQuotedTotal is true for a real paid checkout', () => {
  assert.equal(
    hasQuotedTotal(order([goodLine()], { kind: 'checkout', status: 'paid', total_cents: 25000 })),
    true
  )
})

// 1 Oct 2026: the Retail tick, not the type, decides which basket a line refills.
test('a reorder sends a quote-only good to the request list and a Retail fabric to the cart', () => {
  const order = {
    lines: [
      { sku: 'GOOD-Q', product_type: 'finished_good', sell_retail: false, qty: '2.00', unit_price_cents: 1000 },
      { sku: 'CLOTH-R', product_type: 'fabric', sell_retail: true, qty: '3.00', unit_price_cents: 5000 },
      { sku: 'CLOTH-PART', product_type: 'fabric', sell_retail: true, qty: '2.50', unit_price_cents: 5000 },
      { sku: 'GOOD-OLD', product_type: 'finished_good', qty: '1.00', unit_price_cents: 900 },
    ],
  }
  assert.deepEqual(toRequestLines(order).map((line) => [line.sku, line.unit ?? 'metre']), [
    ['GOOD-Q', 'unit'],
    ['CLOTH-PART', 'metre'],
  ])
  assert.deepEqual(toCartLines(order).map((line) => [line.sku, line.qty]), [
    ['CLOTH-R', 3],
    ['GOOD-OLD', 1],
  ])
})
