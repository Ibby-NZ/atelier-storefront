// Client-side cart helper. The cart lives in localStorage under `atelier_cart`
// as an array of line items `{ sku, name, qty, price_cents, currency }`. This is
// the single write path used by "Add to Cart" (US-018); the full cart page with
// quantity edit / remove and checkout arrives in US-019.
//
// Every mutation dispatches a same-tab `atelier-cart-change` event so islands in
// the same document (e.g. the header CartIndicator) can refresh. The browser's
// native `storage` event only fires in OTHER tabs, so we need our own signal for
// the tab that made the change.

import { STORE_CURRENCY } from './money.js'

// Exported so the header island can compare it against a native `storage`
// event's key without redefining the string.
export const STORAGE_KEY = 'atelier_cart'
export const CART_EVENT = 'atelier-cart-change'

// SSR runs islands once before hydration; guard every localStorage access.
const hasWindow = () => typeof window !== 'undefined'

export function readCart() {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const items = JSON.parse(raw)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

// Persist the cart and notify same-tab listeners. Never throws — a full or
// unavailable localStorage must not break the page.
function writeCart(items) {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    window.dispatchEvent(new Event(CART_EVENT))
  } catch {
    // Storage unavailable (private mode / quota) — ignore silently.
  }
}

// Adds `qty` of a finished-good line to the cart, merging by SKU so repeat adds
// bump the quantity instead of duplicating the row. Returns the new cart.
export function addToCart(item, qty = 1) {
  if (!item || !item.sku) return readCart()
  const amount = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1
  const items = readCart()
  const existing = items.find((line) => line.sku === item.sku)
  const next = existing
    ? items.map((line) =>
        line.sku === item.sku ? { ...line, qty: (Number(line.qty) || 0) + amount } : line
      )
    : [...items, { ...item, qty: amount }]
  writeCart(next)
  return next
}

// Sets the absolute quantity of a line (US-019 cart edit). A qty <= 0 removes
// the line. Returns the new cart. Immutable — never mutates the stored array.
export function setCartQty(sku, qty) {
  const amount = Math.floor(Number(qty))
  if (!Number.isFinite(amount) || amount <= 0) return removeFromCart(sku)
  const next = readCart().map((line) =>
    line.sku === sku ? { ...line, qty: amount } : line
  )
  writeCart(next)
  return next
}

// Removes a line by SKU. Returns the new cart.
export function removeFromCart(sku) {
  const next = readCart().filter((line) => line.sku !== sku)
  writeCart(next)
  return next
}

// Empties the cart (after a completed checkout). Returns [].
export function clearCart() {
  writeCart([])
  return []
}

/**
 * Whether a FAILED `GET /checkout/session/:id` on the success page should still
 * empty the cart.
 *
 * Stripe redirects to /checkout/success only once it has taken the money, so on
 * that page a failed verify is not evidence of a failed payment — it is usually
 * evidence that WE did not answer. Keeping a paid basket there is what turns an
 * API blip into a second charge for the same goods.
 *
 * The single exception is 404: that is the API having reached Stripe and Stripe
 * disowning the session, i.e. a hand-made or stale `?session_id=`. The cart is
 * deliberately kept for that unvouched case so a crafted link cannot empty a
 * shopper's basket.
 *
 * Anything without a status (a bug thrown after the fetch resolved) clears too —
 * the fetch having succeeded is itself evidence the payment is real.
 *
 * @param {{ status?: number }} error rejection from apiFetch (an ApiError)
 * @returns {boolean}
 */
export function shouldClearCartAfterFailedVerify(error) {
  return error?.status !== 404
}

// Total item count across all lines.
export function cartCount(items = readCart()) {
  return items.reduce((sum, line) => sum + (Number(line.qty) || 0), 0)
}

/**
 * The currency the cart is quoted in. Always `STORE_CURRENCY` — a basket cannot
 * be mixed any more, because a line's price never came from the supplier's
 * currency in the first place (see money.js).
 *
 * It takes the stored lines and IGNORES their `currency` field on purpose. A
 * cart written before this fix is sitting in a real shopper's localStorage with
 * `"currency":"USD"` on it, and honouring that would keep printing "US$429" on
 * a figure the API has always held as New Zealand cents — and would keep
 * suppressing the subtotal on a basket that was never actually mixed
 * (audit SF-B2C-02: a US$ Trend line first and an NZ$ line second used to total
 * as "US$" of both).
 */
export function cartCurrency() {
  return STORE_CURRENCY
}

// Subtotal in cents. Lines with an unknown price (price_cents null) contribute 0
// — the cart only holds finished goods with a retail price, but guard anyway.
export function cartSubtotalCents(items = readCart()) {
  return items.reduce(
    (sum, line) => sum + (Number(line.price_cents) || 0) * (Number(line.qty) || 0),
    0
  )
}
