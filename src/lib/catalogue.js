// Shared catalogue view helpers.
//
// The price rules (FR-3) and the friendly product-type labels are used by the
// library grid, the product detail island and the homepage, so they live here
// rather than being copied into each. Pure functions only — no fetching, no DOM.

import { formatMoney } from './money.js'
import { tradeStatus, TRADE_STATUS } from './account.js'

export const PRODUCT_TYPE_LABELS = Object.freeze({
  fabric: 'Fabric',
  finished_good: 'Finished good',
})

export const productTypeLabel = (type) => PRODUCT_TYPE_LABELS[type] || type || ''

// `products.currency` is the SUPPLIER's currency (EUR for Pierre Frey, USD for
// Trend…) and belongs to `retail_price_cents`. `trade_price_cents` is different:
// the API precomputes it through the pricing waterfall and stores it in **NZD
// cents**. Formatting it with `product.currency` renders a New Zealand figure as
// "US$187.76". Trade money is always NZD.
export const TRADE_CURRENCY = 'NZD'

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

const noPriceCopyFor = (viewer) => {
  if (!viewer) return NO_PRICE_COPY.guest
  if (tradeStatus(viewer) === TRADE_STATUS.PENDING) return NO_PRICE_COPY.pending
  // Approved trade with no trade figure (every finished good), a customer, or
  // staff: they are signed in, so the only honest line is "ask us".
  return NO_PRICE_COPY.signedIn
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
 * @returns {{ label: string, text: string, muted: boolean, indicative: boolean, retail: string|null }}
 */
export function priceInfo(product, viewer = null) {
  if (!product) {
    return { label: '', text: '', muted: true, indicative: false, retail: null }
  }

  const currency = product.currency || 'NZD'
  const hasRetail = !product.price_hidden && product.retail_price_cents != null

  if (product.trade_price_cents != null) {
    return {
      label: 'Trade',
      text: formatMoney(product.trade_price_cents, TRADE_CURRENCY),
      muted: false,
      indicative: true,
      // Retail is struck through beside the trade price when we may show it.
      retail: hasRetail ? formatMoney(product.retail_price_cents, currency) : null,
    }
  }

  if (!hasRetail) {
    return {
      label: '',
      text: noPriceCopyFor(viewer),
      muted: true,
      indicative: false,
      retail: null,
    }
  }

  return {
    label: '',
    text: formatMoney(product.retail_price_cents, currency),
    muted: false,
    indicative: true,
    retail: null,
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
