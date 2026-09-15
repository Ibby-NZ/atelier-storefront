import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { readCart, cartCount, cartSubtotalCents, cartCurrency, CART_EVENT } from '../lib/cart.js'
import { formatMoney } from '../lib/money.js'

// Checkout island (US-019). Shows the cart subtotal, a shipping-zone selector
// that fetches a live quote from GET /shipping/quote, the order total, and a
// "Pay by Card" button that POSTs the cart to /checkout/session and redirects
// the browser to Stripe. No prices are sent to the server — only { sku, qty }
// per line, the zone and the three optional free-text fields below; the API
// re-resolves every price (see checkout.js).
//
// Shipping zones are the three fixed New Zealand zones seeded in the API
// (meeting decision, flat-rate per zone). The quote itself is always live.

const SHIPPING_ZONES = ['Auckland', 'North Island', 'South Island']

export default function Checkout() {
  const [items, setItems] = useState(null)
  const [zone, setZone] = useState(SHIPPING_ZONES[0])
  const [quote, setQuote] = useState(null) // { rate_cents } or null
  const [quoteStatus, setQuoteStatus] = useState('idle') // idle|loading|ready|error
  const [quoteError, setQuoteError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payError, setPayError] = useState('')
  // Three optional fields the client fills in here, carried to the order through
  // Stripe session metadata (the API writes them onto the order in the webhook).
  // Blank ones are omitted from the body rather than sent as empty strings.
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')
  const [poNumber, setPoNumber] = useState('')

  useEffect(() => {
    setItems(readCart())
    const sync = () => setItems(readCart())
    window.addEventListener(CART_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CART_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const totalQty = useMemo(() => (items ? cartCount(items) : 0), [items])

  // Fetch a live shipping quote whenever the zone or total quantity changes.
  useEffect(() => {
    if (!items || items.length === 0) return
    let active = true
    setQuoteStatus('loading')
    setQuoteError('')
    apiFetch(
      `/shipping/quote?zone=${encodeURIComponent(zone)}&qty=${encodeURIComponent(totalQty)}`
    )
      .then((body) => {
        if (!active) return
        setQuote(body)
        setQuoteStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setQuote(null)
        setQuoteError(err instanceof ApiError ? err.message : 'Could not fetch a shipping quote.')
        setQuoteStatus('error')
      })
    return () => {
      active = false
    }
  }, [items, zone, totalQty])

  if (items === null) {
    return <p className="products-status">Loading checkout…</p>
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <p className="products-empty">Your cart is empty.</p>
        <a className="btn btn-primary" href="/products">
          Browse products
        </a>
      </div>
    )
  }

  const currency = cartCurrency(items)
  const subtotal = cartSubtotalCents(items)
  const shipping = quoteStatus === 'ready' && quote ? Number(quote.rate_cents) : null
  const total = shipping != null ? subtotal + shipping : null

  const payByCard = async () => {
    setSubmitting(true)
    setPayError('')
    try {
      const lines = items.map((line) => ({ sku: line.sku, qty: Number(line.qty) }))
      const body = await apiFetch('/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines,
          zone,
          // JSON.stringify drops undefined keys, so a blank field is simply
          // not sent rather than written as an empty string.
          notes: notes.trim() || undefined,
          client_reference: reference.trim() || undefined,
          customer_po_number: poNumber.trim() || undefined,
        }),
      })
      if (body?.url) {
        // Cart is intentionally NOT cleared here — Stripe's cancel_url returns
        // to /cart with the cart intact; the success page clears it instead.
        window.location.href = body.url
      } else {
        setPayError('Checkout could not start. Please try again.')
        setSubmitting(false)
      }
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Checkout could not start. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="checkout">
      <ul className="checkout-lines">
        {items.map((line) => (
          <li key={line.sku} className="checkout-line">
            <span>
              {line.name || line.sku}
              {line.colourway ? ` — ${line.colourway}` : ''} × {line.qty}
            </span>
            <span>
              {formatMoney((Number(line.price_cents) || 0) * (Number(line.qty) || 0), line.currency)}
            </span>
          </li>
        ))}
      </ul>

      <div className="checkout-shipping">
        <label className="filter">
          <span>Shipping zone</span>
          <select value={zone} onChange={(event) => setZone(event.target.value)}>
            {SHIPPING_ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="field-group">
        <legend>Your reference (optional)</legend>
        <label className="field">
          <span>Order notes</span>
          <textarea
            rows={3}
            maxLength={500}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Your reference</span>
          <input
            type="text"
            maxLength={200}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Your PO number</span>
          <input
            type="text"
            maxLength={200}
            value={poNumber}
            onChange={(event) => setPoNumber(event.target.value)}
          />
        </label>
      </fieldset>

      {currency ? (
        <dl className="checkout-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(subtotal, currency)}</dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd>
              {quoteStatus === 'loading' && 'Calculating…'}
              {quoteStatus === 'ready' && shipping != null && formatMoney(shipping, currency)}
              {quoteStatus === 'error' && '—'}
            </dd>
          </div>
          <div className="checkout-total">
            <dt>Total</dt>
            <dd>
              {total != null ? formatMoney(total, currency) : '—'}
              <span className="indicative-note">Indicative</span>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="cart-note">Items in different currencies check out separately.</p>
      )}

      {quoteStatus === 'error' && <p className="error-state">{quoteError}</p>}
      {payError && (
        <p className="error-state">
          {payError} <a href="/cart">Review your cart</a>
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={payByCard}
        disabled={submitting || quoteStatus !== 'ready'}
      >
        {submitting ? 'Redirecting…' : 'Pay by card'}
      </button>
      <p className="cart-note">
        Card payment is handled by Stripe, which collects your delivery address and
        contact number on the next screen. We deliver within New Zealand only.
      </p>
      <a className="cart-continue" href="/cart">
        Back to cart
      </a>
    </div>
  )
}
