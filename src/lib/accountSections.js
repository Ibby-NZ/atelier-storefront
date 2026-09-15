// Which panels the account page shows, and what each says when it is empty.
//
// The account area serves three different people and must not look broken to any
// of them:
//   - a plain customer: orders only. Everything else belongs to a programme they
//     are not in, and showing them empty trade panels would be noise.
//   - an approved trade account NOT YET LINKED to a Dynamics customer: the trade
//     panels exist but cannot have content, because the back office has not
//     matched the login to a company. Saying "0 invoices" would be a lie by
//     omission — the honest message is that the account is still being set up.
//   - an approved, linked trade account: everything the API will serve.
//
// The link state comes from `GET /account/summary` and NOWHERE ELSE. It is not
// derived from the user object, not cached, not inferred: it decides what the
// nav offers, and a client-derived value would make the nav an authorisation
// decision made in the browser. The API is the only authority — every panel's
// data is separately scoped server-side, so a tampered nav reveals nothing, but
// the nav should still be right.
//
// Pure — no fetch, no DOM. Guarded by accountSections.test.js.

/** Section ids, in display order. */
export const SECTION = Object.freeze({
  DASHBOARD: 'dashboard',
  ORDERS: 'orders',
  SAMPLES: 'samples',
  INVOICES: 'invoices',
  PRICE_LISTS: 'price-lists',
  DETAILS: 'details',
})

// Copy for a panel that exists but has nothing in it yet, per reason. The
// distinction is the point: "nothing yet" and "we have not finished setting your
// account up" look identical on screen and mean completely different things.
const PENDING_LINK_NOTE =
  'We are still matching your login to your Atelier account. Your account manager will be in touch — nothing is missing from your record.'

const SECTIONS = Object.freeze([
  Object.freeze({
    id: SECTION.DASHBOARD,
    label: 'Overview',
    trade: false,
    needsLink: false,
  }),
  Object.freeze({
    id: SECTION.ORDERS,
    label: 'Orders',
    // Web orders are scoped by user_id, not by the Dynamics link, so they work
    // for every signed-in account from day one.
    trade: false,
    needsLink: false,
    empty: 'You have not placed an order through the site yet.',
  }),
  Object.freeze({
    id: SECTION.SAMPLES,
    label: 'Samples',
    trade: true,
    needsLink: true,
    empty: 'No cuttings are recorded against your account.',
    pending: PENDING_LINK_NOTE,
  }),
  Object.freeze({
    id: SECTION.INVOICES,
    label: 'Invoices',
    trade: true,
    needsLink: true,
    empty: 'No invoices are recorded against your account.',
    pending: PENDING_LINK_NOTE,
  }),
  Object.freeze({
    id: SECTION.PRICE_LISTS,
    label: 'Price lists',
    trade: true,
    needsLink: false,
    // Gated by the API's own feature flag rather than by entitlement — see
    // atelier-api src/pricing/trade-price-lists.js.
    needsFlag: true,
    empty: 'No price lists are published yet.',
  }),
  Object.freeze({
    id: SECTION.DETAILS,
    label: 'Account',
    trade: false,
    needsLink: false,
  }),
])

/**
 * The sections to render, for a given account summary.
 *
 * @param {object|null} summary  the body of GET /account/summary, or null for a
 *   non-trade account (which never calls it).
 * @returns {Array<{ id, label, state: 'ready'|'pending-link', empty?, pending? }>}
 */
export function accountSections(summary) {
  const isTrade = Boolean(summary)
  const linked = summary?.trade_account?.linked === true
  const priceListsAvailable = summary?.price_lists?.available === true

  return SECTIONS.filter((section) => {
    if (section.trade && !isTrade) return false
    if (section.needsFlag && !priceListsAvailable) return false
    return true
  }).map((section) => ({
    id: section.id,
    label: section.label,
    // 'pending-link' is not an error state — the panel renders, it just explains
    // itself instead of listing rows.
    state: section.needsLink && !linked ? 'pending-link' : 'ready',
    empty: section.empty ?? null,
    pending: section.pending ?? null,
  }))
}

/**
 * The section a URL hash asks for, falling back to the first available one.
 *
 * Unknown or absent hash → the dashboard, never a blank page. A hash naming a
 * section this account cannot see (a bookmarked `#invoices` on a customer login)
 * also falls back, rather than rendering an empty shell.
 *
 * @param {string|null|undefined} hash  e.g. '#invoices'
 * @param {Array<{id: string}>} sections  from accountSections
 * @returns {string}
 */
export function sectionFromHash(hash, sections) {
  const id = hashParts(hash).section
  return sections.some((section) => section.id === id) ? id : (sections[0]?.id ?? SECTION.DASHBOARD)
}

// `#orders/WEB-1234` is the Orders panel opened ON one order — what the
// checkout confirmation links to. The section is the first path segment, the
// order number the rest (an order number never carries a slash).
const hashParts = (hash) => {
  const text = typeof hash === 'string' ? hash.replace(/^#/, '') : ''
  const slash = text.indexOf('/')
  return slash === -1
    ? { section: text, order: null }
    : { section: text.slice(0, slash), order: decodeURIComponent(text.slice(slash + 1)) || null }
}

/** The order number a hash names, or null. */
export function orderFromHash(hash) {
  const { section, order } = hashParts(hash)
  return section === SECTION.ORDERS ? order : null
}

/** The account link that opens the Orders panel on one order. */
export function accountOrderHref(orderNumber) {
  return orderNumber
    ? `/account#${SECTION.ORDERS}/${encodeURIComponent(orderNumber)}`
    : `/account#${SECTION.ORDERS}`
}

/** The DOM id an order card carries, so the hash can scroll to it. */
export function orderCardId(orderNumber) {
  return `order-${String(orderNumber ?? '').replace(/[^A-Za-z0-9_-]/g, '-')}`
}
