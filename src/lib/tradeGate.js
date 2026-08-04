// The trade gate: who may see WHICH HOUSES' designs at all.
//
// atelier-api now carries `brands.trade_only` (default closed). A signed-out
// visitor browses only the house's own workroom, Atelier Textiles NZ; every
// maison Atelier represents is reserved for approved trade accounts — and for
// staff, who have to be able to check the live storefront against what they
// published.
//
// **This is NOT the trade PRICING gate in lib/catalogue.js.** They are two
// different gates and confusing them is the easy mistake:
//   - priceInfo()/`trade_price_cents` decides what a FIGURE says, and is
//     approved trade ALONE (staff deliberately never receive it).
//   - This module is about whether a design is on the site at all, and staff DO
//     pass it.
// A shopper can be past one and not the other, so neither may be derived from
// the other.
//
// The gate is invisible unless it is named, which is the whole reason this file
// exists. A guest served the workroom's designs instead of the whole library has
// no way of knowing the rest is there — the grid simply looks small, and the
// house pages of every maison read as though Atelier held nothing from them. A
// 403 on a design someone was sent a link to reads as a broken page. So four
// surfaces have to say the same thing in the same words (the library grid, the
// product page's server render, the product island's own credentialed refetch,
// and a represented house's page), and this module is what they share: the copy,
// the two destinations, and the one piece of response-shape knowledge each of
// them would otherwise re-derive.
//
// Pure — no DOM, no fetch, no React. The Astro pages import it in frontmatter
// and the islands import it in the browser. Guarded by tradeGate.test.js.

/** Where an unentitled shopper is sent to become entitled. Approval is manual. */
export const TRADE_APPLICATION_PATH = '/trade-application'

/** And where one who already has an approved account signs in. */
export const LOGIN_PATH = '/login'

// One voice, three framings. Each block is heading + body + the two action
// labels, because every surface offers the same two ways out: apply, or sign in
// if the account already exists. The body never says "create an account" — the
// storefront has no standard-customer registration any more (the client has no
// such account product), so trade is the only door and the copy must not point
// at a page that no longer exists.
export const TRADE_GATE_COPY = Object.freeze({
  // The library grid, when meta.trade_gated says this is the public subset.
  library: Object.freeze({
    heading: 'You are browsing our own workroom',
    body:
      'The designs we hold from the maisons we represent are kept for the trade. Apply for a trade account to see the full library, or sign in if yours is already approved.',
    apply: 'Apply for a trade account',
    signIn: 'Sign in',
  }),
  // One product, refused with 403. The API deliberately returns nothing about
  // the product itself, so this copy can never name the house or the design.
  design: Object.freeze({
    heading: 'Part of our trade library',
    body:
      'This design comes from one of the maisons we represent, and we show those to approved trade accounts only. Apply for one and we will be in touch, or sign in if yours is already approved.',
    apply: 'Apply for a trade account',
    signIn: 'Sign in',
  }),
  // A represented house's own page. The house directory stays public — it is
  // marketing — so the name, the country and the story are all still shown; it
  // is only what Atelier HOLDS from the house that is behind the gate.
  house: Object.freeze({
    heading: 'Held for the trade',
    body:
      'We hold this house by the metre, cut to order, and show the designs to approved trade accounts. Apply for one to browse what we hold, or sign in if yours is already approved.',
    apply: 'Apply for a trade account',
    signIn: 'Sign in',
  }),
  // The SAME block, for a shopper who is already through the gate. It has to
  // exist: the house page's server render is anonymous (Astro's fetch carries no
  // browser cookie), so without a viewer test an approved trade customer is
  // invited to apply for the account they are signed in with, and — because the
  // design count came back 0 — is given no route at all into the designs they
  // are entitled to. This is the note's other half, chosen in the browser.
  houseEntitled: Object.freeze({
    heading: 'Held for the trade',
    body: 'Your trade account is approved, so everything we hold from this house is open to you.',
    browse: 'View all products',
  }),
})

// Head tags for the 403 product page. Generic by necessity (see `design` above)
// and deliberately not an error voice: the URL is real and shareable, and the
// page is an invitation rather than a failure.
export const TRADE_GATE_PAGE = Object.freeze({
  title: 'A trade design — Atelier Textiles',
  description:
    'This design is part of the Atelier Textiles trade library, shown to approved trade accounts.',
})

/**
 * Is this failure the trade gate rather than a real error?
 *
 * The API answers a gated design with **403**, not 404 — the product exists and
 * its URL is shareable — and marks the body `trade_only: true` so the shape is
 * unambiguous. Duck-typed on `.status`/`.body` rather than `instanceof
 * ApiError`: this module stays free of lib/api.js (and of the fetch/storage
 * tree behind it) so it can be tested with plain objects under `node --test`.
 *
 * @param {{ status?: number, body?: { trade_only?: boolean }|null }|null|undefined} error
 * @returns {boolean}
 */
export function isTradeGateError(error) {
  return Boolean(error) && error.status === 403 && error.body?.trade_only === true
}

/**
 * Is this product LIST the public subset rather than the whole library?
 *
 * `GET /catalogue/products` carries `meta.trade_gated`; true means the viewer
 * is seeing the workroom alone. Strict `=== true` so an absent field on an
 * older API (or a body that failed to parse) reads as "not gated" and the grid
 * simply says nothing — announcing the gate where there is none would be worse
 * than staying quiet.
 *
 * @param {{ meta?: { trade_gated?: boolean } }|null|undefined} body
 * @returns {boolean}
 */
export function isTradeGatedList(body) {
  return body?.meta?.trade_gated === true
}

/**
 * The library grid filtered to one house.
 *
 * Shared by the house page's trade note and anything else that wants to hand a
 * shopper off to the grid, so the query-string shape (and the escaping) is
 * written once. The grid itself is the gate — an unentitled shopper landing here
 * gets the library banner, an entitled one gets the designs.
 *
 * @param {string} brandSlug
 * @returns {string}
 */
export function houseDesignsHref(brandSlug) {
  return `/products?brand=${encodeURIComponent(String(brandSlug ?? ''))}`
}

/**
 * The sign-in link, returning the shopper to where they were gated.
 *
 * Same acceptance rule as LoginForm's own `redirectTarget`, and it has to be:
 * `?redirect=` is honoured by that island, so a value it would refuse is a
 * value worth not putting in a href. Anything that is not a same-site absolute
 * path (including a protocol-relative `//evil.example`) degrades to a plain
 * sign-in rather than being sanitised into something else.
 *
 * @param {string} [returnTo]  a same-site path such as `/products/atlas`
 * @returns {string}
 */
export function signInHref(returnTo) {
  const path = typeof returnTo === 'string' ? returnTo : ''
  if (!path.startsWith('/') || path.startsWith('//')) return LOGIN_PATH
  return `${LOGIN_PATH}?redirect=${encodeURIComponent(path)}`
}
