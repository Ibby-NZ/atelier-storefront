import { useEffect, useState } from 'react'
import {
  readCart,
  setCartQty,
  removeFromCart,
  cartSubtotalCents,
  cartCurrency,
  CART_EVENT,
} from '../lib/cart.js'
import { formatMoney } from '../lib/money.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { noPriceCopyFor } from '../lib/catalogue.js'

// Cart page island (US-019). Shows the client-side cart (finished goods only —
// fabrics never reach the cart, they go through the order-request flow), lets
// the shopper change quantities or remove lines, and links to checkout. All
// state lives in localStorage via src/lib/cart.js; this component mirrors it and
// re-reads on every CART_EVENT so the header count and page stay in sync.
//
// Lines added before the cart carried imagery (US-018 shape) simply render
// without a thumbnail or link — every merchandising field is optional here.
//
// One component only: the store ESLint has no React plugin, so a JSX-only
// sub-component reference would trip no-unused-vars (see ProductDetail.jsx).

const MAX_QTY = 99

export default function Cart() {
  const [items, setItems] = useState(null) // null until hydrated (avoids SSR flash)
  // Only ever selects the no-price copy — a guest is invited to sign in, a
  // signed-in shopper is not.
  const [viewer, setViewer] = useState(null)

  useEffect(() => {
    setItems(readCart())
    fetchCurrentUser().then(setViewer, () => setViewer(null))
    const sync = () => setItems(readCart())
    window.addEventListener(CART_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CART_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  if (items === null) {
    return <p className="products-status">Loading your cart…</p>
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <p className="products-empty">Your cart is empty.</p>
        <a className="btn btn-primary" href="/products">
          Browse the library
        </a>
      </div>
    )
  }

  const currency = cartCurrency(items)
  const subtotal = cartSubtotalCents(items)

  const changeQty = (sku, qty) => setItems(setCartQty(sku, qty))
  const remove = (sku) => setItems(removeFromCart(sku))

  return (
    <div className="cart">
      <ul className="cart-lines">
        {items.map((line) => {
          const linePrice = (Number(line.price_cents) || 0) * (Number(line.qty) || 0)
          const label = line.name || line.sku
          return (
            <li key={line.sku} className="cart-line">
              <div className="cart-line-media">
                {line.image_url ? (
                  <img className="cart-line-image" src={line.image_url} alt="" loading="lazy" />
                ) : (
                  <span className="cart-line-image product-image-placeholder" aria-hidden="true" />
                )}
              </div>

              <div className="cart-line-main">
                {line.brand && <p className="cart-line-brand">{line.brand}</p>}
                <p className="cart-line-name">
                  {line.slug ? (
                    <a className="cart-line-link" href={`/products/${line.slug}`}>
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                  {line.colourway && <span className="cart-line-colourway"> — {line.colourway}</span>}
                </p>
                <p className="cart-line-unit">
                  {line.price_cents != null
                    ? `${formatMoney(line.price_cents, line.currency)} each`
                    : noPriceCopyFor(viewer)}
                  <span className="detail-selected-sku">{line.sku}</span>
                </p>
              </div>

              <label className="cart-qty">
                <span className="sr-only">Quantity for {label}</span>
                <input
                  type="number"
                  min="1"
                  max={MAX_QTY}
                  step="1"
                  value={line.qty}
                  onChange={(event) => changeQty(line.sku, event.target.value)}
                />
              </label>

              <p className="cart-line-total">{formatMoney(linePrice, line.currency)}</p>

              <button
                type="button"
                className="cart-remove"
                onClick={() => remove(line.sku)}
                aria-label={`Remove ${label}`}
              >
                Remove
              </button>
            </li>
          )
        })}
      </ul>

      <div className="cart-summary">
        {currency ? (
          <p className="cart-subtotal">
            <span>Subtotal</span>
            <strong>{formatMoney(subtotal, currency)}</strong>
            <span className="indicative-note">Indicative</span>
          </p>
        ) : (
          <p className="cart-note">Items in different currencies check out separately.</p>
        )}
        <p className="cart-note">Shipping is calculated at checkout.</p>
        <a className="btn btn-primary" href="/checkout">
          Proceed to checkout
        </a>
        <a className="cta-underline cart-continue" href="/products">
          Continue shopping
        </a>
      </div>
    </div>
  )
}
