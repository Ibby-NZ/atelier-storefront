// Shared catalogue view helpers.
//
// The price rules (FR-3) and the friendly product-type labels are used by the
// library grid, the product detail island and the homepage, so they live here
// rather than being copied into each. Pure functions only — no fetching, no DOM.

import { formatMoney, STORE_CURRENCY } from './money.js'
import { tradeStatus, TRADE_STATUS } from './account.js'
import { signInHref } from './tradeGate.js'

export const PRODUCT_TYPE_LABELS = Object.freeze({
  fabric: 'Fabric',
  finished_good: 'Finished good',
})

export const productTypeLabel = (type) => PRODUCT_TYPE_LABELS[type] || type || ''

// The merchandising category — what a shopper browses by, and a different axis
// from `product_type`. `product_type` is `fabric | finished_good` and exists to
// decide whether stock is counted in metres or in units; a cushion and a throw
// are both finished goods, which is a true statement and a useless one to put on
// a card. The API's vocabulary is nine values wide (`CATEGORIES` in its
// scripts/lib/price-template.js, three columns' worth of CHECK); most of the
// catalogue is uncategorised, and that is a real state rather than a gap.
export const CATEGORY_LABELS = Object.freeze({
  fabric: 'Fabric',
  wallpaper: 'Wallpaper',
  trimming: 'Trimming',
  accessory: 'Accessory',
  'bed-linen': 'Bed linen',
  towel: 'Towel',
  cushion: 'Cushion',
  throw: 'Throw',
  misc: 'Miscellaneous',
})

/**
 * A category's label, falling back to the RAW VALUE rather than to blank.
 *
 * The storefront and the API deploy separately, so this build can be behind the
 * vocabulary. A card rendering nothing would read as "uncategorised" when the
 * truth is "a category this build has not been taught" — and the facet counts
 * beside it would agree with themselves while quietly hiding a whole category.
 */
export const categoryLabel = (value) =>
  value == null || value === '' ? '' : (CATEGORY_LABELS[value] || value)

/**
 * The one line that says what a product IS, for a card's spec line and the
 * detail eyebrow.
 *
 * The category when there is one, the product type otherwise. Never both: for
 * every fabric they are the same word, so printing the pair gives
 * "Fabric · Fabric"; and where they differ the category is the more specific of
 * the two and the type is the one the shopper has no use for.
 */
export const productClassLabel = (product) =>
  categoryLabel(product?.category) || productTypeLabel(product?.product_type)

// `products.currency` is the SUPPLIER's currency (EUR for Pierre Frey, USD for
// Trend…) — what Atelier PAYS a house. It belongs to NEITHER price field: the
// trade figure comes out of the pricing waterfall and the retail figure out of
// the office or the D365 merge, and both are stored in New Zealand cents
// whatever that column says. Reading it as the retail price's currency is what
// printed a NZ$429 towel as "US$429" on the card beside a NZ$389 one — two
// currencies in one grid, for products a shopper buys in one basket, in one
// Stripe charge, delivered to one New Zealand address.
//
// So there is no per-product currency any more, and no separate trade one: every
// figure a customer sees is `STORE_CURRENCY` (money.js), the SELLING region's —
// theirs. `TRADE_CURRENCY` is gone rather than aliased, because a name that says
// the trade figure has a currency of its own is the misreading this fixes.
export { STORE_CURRENCY }

// What to say where a product has no price this viewer may see. Which line
// applies depends on WHO is looking, which is why priceInfo takes a viewer:
// "Sign in for trade pricing" is an invitation to a guest and an insult to
// someone already signed in — and most of the catalogue lands here, because
// every international house hides retail and only fabrics carry a trade figure.
export const NO_PRICE_COPY = Object.freeze({
  guest: 'Sign in for trade pricing',
  pending: 'Trade pricing once approved',
  signedIn: 'Price on request',
})

export const noPriceCopyFor = (viewer) => {
  if (!viewer) return NO_PRICE_COPY.guest
  if (tradeStatus(viewer) === TRADE_STATUS.PENDING) return NO_PRICE_COPY.pending
  // Approved trade with no trade figure (every finished good), a customer, or
  // staff: they are signed in, so the only honest line is "ask us".
  return NO_PRICE_COPY.signedIn
}

/**
 * The price a shopper may actually see, in cents, or null. Trade first (only
 * ever present for an approved trade user), then a visible retail figure. The
 * library sorts and bands on this and nothing else — never on a figure the
 * card is not showing.
 */
export function visiblePriceCents(product) {
  if (product?.trade_price_cents != null) return product.trade_price_cents
  if (product && !product.price_hidden && product.retail_price_cents != null) {
    return product.retail_price_cents
  }
  return null
}

// The library's Price facet: $100 bands over the visible price. The bands are
// the office's ("100–200, 201–300, …"): the first closed band starts at $100,
// each later one at the previous ceiling plus one, and anything under $100 is
// its own row. Banded on the figure the card shows, so a trade viewer's rows
// the bands are the same money for every viewer and every house: one currency,
// so a $100–$200 row cannot hold a US$150 fabric next to a NZ$150 one.
export const PRICE_BAND_WIDTH = 100
const UNDER_FIRST_BAND = Object.freeze({
  value: `under-${PRICE_BAND_WIDTH}`,
  label: `Under $${PRICE_BAND_WIDTH}`,
  from: 0,
})
const dollars = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 0 })

/**
 * @param {number|null|undefined} cents
 * @returns {{ value: string, label: string, from: number }|null} — `value` is
 *   the URL token (`100-200`), `label` the facet row, `from` its sort key.
 */
export function priceBandFor(cents) {
  if (cents == null || !Number.isFinite(cents)) return null
  const amount = cents / 100
  if (amount < PRICE_BAND_WIDTH) return UNDER_FIRST_BAND
  // Band 1 is [100, 200], band k>1 is [(k×100)+1, (k+1)×100].
  const band = Math.max(1, Math.ceil((amount - PRICE_BAND_WIDTH) / PRICE_BAND_WIDTH))
  const from = band === 1 ? PRICE_BAND_WIDTH : band * PRICE_BAND_WIDTH + 1
  const to = (band + 1) * PRICE_BAND_WIDTH
  return { value: `${from}-${to}`, label: `$${dollars.format(from)}–$${dollars.format(to)}`, from }
}

/**
 * What to show where a price goes.
 *
 * Order of precedence (FR-3):
 *   1. `trade_price_cents` — only ever present for an approved trade user, so
 *      if the API sent it, show it.
 *   2. `price_hidden` (international house) or no retail price — the shopper is
 *      not allowed to see a figure; the prompt depends on the viewer.
 *   3. otherwise the retail price.
 *
 * @param {object} product
 * @param {object|null} [viewer] — the /auth/me user, or null when logged out.
 *   Only ever selects COPY: the API decides what pricing data exists, and this
 *   never derives a figure the response did not carry.
 * @param {string} [returnTo] — the page to come back to after signing in. Only
 *   the guest line gets an `href`: "Sign in for trade pricing" used to be drawn
 *   as an action and went nowhere (audit SF-B2C-02, Sept 2026).
 * @returns {{ label: string, text: string, muted: boolean, indicative: boolean, retail: string|null, href: string|null }}
 */
export function priceInfo(product, viewer = null, returnTo = '') {
  if (!product) {
    return { label: '', text: '', muted: true, indicative: false, retail: null, href: null }
  }

  const hasRetail = !product.price_hidden && product.retail_price_cents != null

  if (product.trade_price_cents != null) {
    return {
      label: 'Trade',
      text: formatMoney(product.trade_price_cents, STORE_CURRENCY),
      muted: false,
      indicative: true,
      // Retail is struck through beside the trade price when we may show it —
      // and in the SAME currency, or the saving the strike-through is there to
      // show would be read off two different scales.
      retail: hasRetail ? formatMoney(product.retail_price_cents, STORE_CURRENCY) : null,
      href: null,
    }
  }

  if (!hasRetail) {
    return {
      label: '',
      text: noPriceCopyFor(viewer),
      muted: true,
      indicative: false,
      retail: null,
      href: viewer ? null : signInHref(returnTo),
    }
  }

  return {
    label: '',
    text: formatMoney(product.retail_price_cents, STORE_CURRENCY),
    muted: false,
    indicative: true,
    retail: null,
    href: null,
  }
}

/**
 * The hex tones for a colourway swatch chip. `hex_tones` is jsonb, so it can be
 * null, an array, or (defensively) something else entirely.
 *
 * @param {unknown} hexTones
 * @returns {string[]}
 */
export function toneList(hexTones) {
  return Array.isArray(hexTones) ? hexTones.filter((tone) => typeof tone === 'string') : []
}

/**
 * A CSS background for a swatch or image placeholder, built from a colourway's
 * tones. Mirrors the duotone "weave" treatment in the platform design refs: a
 * fine diagonal texture over a two-stop gradient. The texture layer comes FIRST
 * because it is semi-transparent and sits on top.
 *
 * @param {unknown} hexTones
 * @returns {string|undefined} a `background` value, or undefined when there are
 *   no tones (the caller should fall back to the plain CSS placeholder).
 */
export function weaveBackground(hexTones) {
  const tones = toneList(hexTones)
  if (tones.length === 0) return undefined
  const light = tones[0]
  const dark = tones[tones.length - 1] || tones[0]
  return [
    'repeating-linear-gradient(48deg, rgba(255,255,255,.05) 0 2px, rgba(0,0,0,.05) 2px 4px)',
    `linear-gradient(135deg, ${light}, ${dark})`,
  ].join(', ')
}

/** A fabric is cut to order; everything else is bought off the shelf. */
export const isFabric = (product) => product?.product_type === 'fabric'

/**
 * A one-line prose summary of a product, built from whatever specification
 * fields it actually carries. This is the product page's meta description and
 * its Open Graph description — writing it from the same fields the page shows
 * means every product gets a real description with nothing to hand-author, and
 * a sparse product simply yields a shorter sentence rather than a broken one
 * with "undefined" in it.
 *
 * NEVER includes a price: an international house hides its retail figure from
 * the page (FR-3), and a description is served to everyone, signed in or not.
 *
 * @param {object|null} product
 * @returns {string}
 */
export function productSummary(product) {
  if (!product) return ''

  const house = product.brand?.name
  const opening = house ? `${product.name} by ${house}` : product.name

  // What it is, then what it is made of, as ONE clause — "upholstery fabric in
  // 100% linen" — because "fabric, in 100% linen" reads as a list of two things.
  // Width follows as its own clause.
  const kind = [product.application?.toLowerCase(), isFabric(product) ? 'fabric' : null]
    .filter(Boolean)
    .join(' ')

  const composition = product.composition
    ? kind
      ? `${kind} in ${product.composition}`
      : product.composition
    : kind

  const details = [
    composition || null,
    product.width ? `${product.width} wide` : null,
  ].filter(Boolean)

  const body = details.length ? `${opening} — ${details.join(', ')}.` : `${opening}.`
  const close = isFabric(product)
    ? 'Cut to order by the metre at Atelier Textiles.'
    : 'Available at Atelier Textiles.'

  return `${body} ${close}`
}
