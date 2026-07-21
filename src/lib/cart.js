// Client-side cart helper. The cart lives in localStorage under `atelier_cart`
// as an array of line items `{ sku, name, qty, price_cents, currency }`. This is
// the single write path used by "Add to Cart" (US-018); the full cart page with
// quantity edit / remove and checkout arrives in US-019.
//
// Every mutation dispatches a same-tab `atelier-cart-change` event so islands in
// the same document (e.g. the header CartIndicator) can refresh. The browser's
// native `storage` event only fires in OTHER tabs, so we need our own signal for
// the tab that made the change.

const STORAGE_KEY = 'atelier_cart'
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
