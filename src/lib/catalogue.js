// Shared catalogue view helpers.
//
// The price rules (FR-3) and the friendly product-type labels are used by the
// library grid, the product detail island and the homepage, so they live here
// rather than being copied into each. Pure functions only — no fetching, no DOM.

import { formatMoney } from './money.js'

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

/**
 * What to show where a price goes.
 *
 * Order of precedence (FR-3):
 *   1. `trade_price_cents` — only ever present for an approved trade user, so
 *      if the API sent it, show it.
 *   2. `price_hidden` (international house) or no retail price — the shopper is
 *      not allowed to see a figure; prompt them to sign in for trade pricing.
 *   3. otherwise the retail price.
 *
 * @param {object} product
 * @returns {{ label: string, text: string, muted: boolean, indicative: boolean, retail: string|null }}
 */
export function priceInfo(product) {
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
      text: 'Sign in for trade pricing',
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
