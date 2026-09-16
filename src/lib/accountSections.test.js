import test from 'node:test'
import assert from 'node:assert/strict'
import { accountOrderHref, accountSections, orderCardId, orderFromHash, sectionFromHash, SECTION } from './accountSections.js'

const summary = (overrides = {}) => ({
  trade_account: { linked: true, company_name: 'Studio Interiors', account_manager: null },
  price_lists: { available: false },
  ...overrides,
})

const ids = (sections) => sections.map((section) => section.id)

test('a non-trade account sees only the non-trade sections', () => {
  // null summary = the account never called /account/summary, i.e. not trade.
  assert.deepEqual(ids(accountSections(null)), [
    SECTION.DASHBOARD,
    SECTION.ORDERS,
    SECTION.DETAILS,
    SECTION.PASSWORD,
  ])
})

test('a linked trade account sees samples and invoices', () => {
  assert.deepEqual(ids(accountSections(summary())), [
    SECTION.DASHBOARD,
    SECTION.ORDERS,
    SECTION.SAMPLES,
    SECTION.INVOICES,
    SECTION.DETAILS,
    SECTION.PASSWORD,
  ])
})

test('price lists appear only when the API says the feature is on', () => {
  assert.ok(!ids(accountSections(summary())).includes(SECTION.PRICE_LISTS))
  const enabled = accountSections(summary({ price_lists: { available: true } }))
  assert.ok(ids(enabled).includes(SECTION.PRICE_LISTS))
})

test('an unlinked trade account still sees the panels, marked pending', () => {
  const sections = accountSections(
    summary({ trade_account: { linked: false, company_name: null, account_manager: null } })
  )
  const byId = Object.fromEntries(sections.map((section) => [section.id, section]))
  // The panels exist — hiding them would leave no way to explain why the
  // history is missing.
  assert.equal(byId[SECTION.SAMPLES].state, 'pending-link')
  assert.equal(byId[SECTION.INVOICES].state, 'pending-link')
  // Web orders are scoped by user id, not by the Dynamics link, so they work.
  assert.equal(byId[SECTION.ORDERS].state, 'ready')
  assert.match(byId[SECTION.INVOICES].pending, /still matching your login/i)
})

test('link state is read strictly — anything but true is unlinked', () => {
  for (const linked of [undefined, null, 'yes', 1]) {
    const sections = accountSections(summary({ trade_account: { linked } }))
    const invoices = sections.find((section) => section.id === SECTION.INVOICES)
    assert.equal(invoices.state, 'pending-link')
  }
})

test('sectionFromHash honours a known section and falls back otherwise', () => {
  const sections = accountSections(summary())
  assert.equal(sectionFromHash('#invoices', sections), SECTION.INVOICES)
  assert.equal(sectionFromHash('invoices', sections), SECTION.INVOICES)
  assert.equal(sectionFromHash('#nope', sections), SECTION.DASHBOARD)
  assert.equal(sectionFromHash('', sections), SECTION.DASHBOARD)
  assert.equal(sectionFromHash(null, sections), SECTION.DASHBOARD)
})

test('sectionFromHash falls back when the hash names a section this account cannot see', () => {
  // A customer with a bookmarked #invoices must land somewhere real.
  assert.equal(sectionFromHash('#invoices', accountSections(null)), SECTION.DASHBOARD)
})

test('#orders/<number> is the Orders panel opened on that order', () => {
  const sections = accountSections(summary())
  assert.equal(sectionFromHash('#orders/WEB-92C95541', sections), SECTION.ORDERS)
  assert.equal(orderFromHash('#orders/WEB-92C95541'), 'WEB-92C95541')
  assert.equal(orderFromHash('#orders'), null)
  assert.equal(orderFromHash('#invoices/WEB-1'), null)
  assert.equal(orderFromHash(''), null)
  // An unknown section with a slash still falls back rather than throwing.
  assert.equal(sectionFromHash('#nope/WEB-1', sections), SECTION.DASHBOARD)
})

test('accountOrderHref and orderCardId round-trip an order number', () => {
  assert.equal(accountOrderHref('WEB-92C95541'), '/account#orders/WEB-92C95541')
  assert.equal(accountOrderHref(null), '/account#orders')
  assert.equal(orderFromHash('#orders/REQ-1%2F2'), 'REQ-1/2')
  assert.equal(orderCardId('WEB-92C95541'), 'order-WEB-92C95541')
  assert.equal(orderCardId('REQ 1/2'), 'order-REQ-1-2')
})
