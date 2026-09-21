import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { readCart, cartCount, cartSubtotalCents, cartCurrency, CART_EVENT } from '../lib/cart.js'
import { formatMoney } from '../lib/money.js'
import { gstCents } from '../lib/gst.js'
import { EMPTY_CUSTOMER, customerFromPrefill, customerBody } from '../lib/checkoutCustomer.js'

// Checkout island (US-019), laid out like a Shopify checkout: Delivery and
// Payment on the left, a sticky order summary on the right (collapsed into a
// "Show order summary" bar on phones — a native <details>, no JS accordion).
// Every shipping zone is quoted live from GET /shipping/quote in parallel so
// the shopper sees each rate before choosing. The customer's contact and
// delivery details are collected HERE (Sept 2026) — a signed-in shopper starts
// from GET /checkout/prefill (account, last order, trade application) and may
// edit every field — and travel with the cart to POST /checkout/session, which
// hands them to Stripe so its page asks for nothing but the card. No prices
// are sent — only { sku, qty } per line plus the zone; the API re-resolves
// every price (see checkout.js). GST (15%, src/lib/gst.js) is shown on goods
// plus freight and charged by the API as its own line.
//
// Shipping zones are the three fixed New Zealand zones seeded in the API
// (meeting decision, flat-rate per zone); delivery is NZ-only, so no country
// field.

const SHIPPING_ZONES = ['Auckland', 'North Island', 'South Island']
const DESKTOP = '(min-width: 1025px)' // matches the commerce.css breakpoint

export default function Checkout() {
  const [items, setItems] = useState(null)
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER)
  const [zone, setZone] = useState(SHIPPING_ZONES[0])
  const [quotes, setQuotes] = useState(null) // { [zone]: rate_cents } once every zone answered
  const [quoteError, setQuoteError] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
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
    // Summary open on desktop, collapsed on phones; follows a resize across
    // the breakpoint so a closed <details> never hides the totals on a
    // widened window.
    const desktop = window.matchMedia(DESKTOP)
    const fit = () => setSummaryOpen(desktop.matches)
    fit()
    desktop.addEventListener('change', fit)
    // Signed in: start the form from the account. 401 (guest) and any other
    // failure simply leave it blank — the prefill is a courtesy, not a gate.
    apiFetch('/checkout/prefill')
      .then((prefill) => setCustomer(customerFromPrefill(prefill)))
      .catch(() => {})
    const sync = () => setItems(readCart())
    window.addEventListener(CART_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      desktop.removeEventListener('change', fit)
      window.removeEventListener(CART_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const totalQty = useMemo(() => (items ? cartCount(items) : 0), [items])

  // Quote every zone whenever the total quantity changes (rates are per-qty).
  useEffect(() => {
    if (!totalQty) return
    let active = true
    setQuotes(null)
    setQuoteError('')
    Promise.all(
      SHIPPING_ZONES.map((z) =>
        apiFetch(`/shipping/quote?zone=${encodeURIComponent(z)}&qty=${encodeURIComponent(totalQty)}`)
      )
    )
      .then((bodies) => {
        if (!active) return
        setQuotes(Object.fromEntries(SHIPPING_ZONES.map((z, i) => [z, Number(bodies[i].rate_cents)])))
      })
      .catch((err) => {
        if (!active) return
        setQuoteError(err instanceof ApiError ? err.message : 'Could not fetch shipping rates.')
      })
    return () => {
      active = false
    }
  }, [totalQty])

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
  const shipping = quotes ? quotes[zone] : null
  const gst = shipping != null ? gstCents(subtotal + shipping) : null
  const total = shipping != null ? subtotal + shipping + gst : null

  const edit = (key) => (event) => setCustomer({ ...customer, [key]: event.target.value })

  const payNow = async (event) => {
    event.preventDefault() // native `required` / type=email validation ran first
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
            customer: customerBody(customer),
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
      <details
        className="checkout-summary"
        open={summaryOpen}
        onToggle={(event) => setSummaryOpen(event.currentTarget.open)}
      >
        <summary>
          <span>{summaryOpen ? 'Hide' : 'Show'} order summary</span>
          <strong>{formatMoney(total ?? subtotal, currency)}</strong>
        </summary>

        <ul className="checkout-lines">
          {items.map((line) => {
            const label = line.name || line.sku
            return (
              <li key={line.sku} className="checkout-line">
                <span className="checkout-line-media">
                  {line.image_url ? (
                    <img className="cart-line-image" src={line.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="cart-line-image product-image-placeholder" aria-hidden="true" />
                  )}
                  <span className="checkout-line-qty" aria-label={`Quantity ${line.qty}`}>
                    {line.qty}
                  </span>
                </span>
                <span className="checkout-line-main">
                  <span className="checkout-line-name">{label}</span>
                  {line.colourway && <span className="checkout-line-meta">{line.colourway}</span>}
                </span>
                <span className="checkout-line-price">
                  {formatMoney((Number(line.price_cents) || 0) * (Number(line.qty) || 0), line.currency)}
                </span>
              </li>
            )
          })}
        </ul>

        <dl className="checkout-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(subtotal, currency)}</dd>
          </div>
          <div>
            <dt>Shipping</dt>
            <dd>{shipping != null ? formatMoney(shipping, currency) : quoteError ? '—' : 'Calculating…'}</dd>
          </div>
          <div>
            <dt>GST 15%</dt>
            <dd>{gst != null ? formatMoney(gst, currency) : '—'}</dd>
          </div>
          <div className="checkout-total">
            <dt>Total</dt>
            <dd>
              {total != null ? formatMoney(total, currency) : '—'}
              <span className="indicative-note">Indicative</span>
            </dd>
          </div>
        </dl>
      </details>

      <form className="checkout-main" onSubmit={payNow}>
        <section className="checkout-section" aria-labelledby="checkout-contact">
          <h2 id="checkout-contact">Contact</h2>
          <div className="checkout-fields">
            <label className="field">
              <span>Email</span>
              <input type="email" autoComplete="email" required value={customer.email} onChange={edit('email')} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input type="tel" autoComplete="tel" required value={customer.phone} onChange={edit('phone')} />
            </label>
          </div>
        </section>

        <section className="checkout-section" aria-labelledby="checkout-delivery">
          <h2 id="checkout-delivery">Delivery</h2>
          <p className="checkout-hint">We deliver within New Zealand only.</p>
          <div className="checkout-fields">
            <label className="field field-span">
              <span>Name or business</span>
              <input type="text" autoComplete="shipping name" required value={customer.name} onChange={edit('name')} />
            </label>
            <label className="field field-span">
              <span>Address</span>
              <input type="text" autoComplete="shipping address-line1" required value={customer.line1} onChange={edit('line1')} />
            </label>
            <label className="field field-span">
              <span>
                Apartment, suite, etc.<span className="field-optional">optional</span>
              </span>
              <input type="text" autoComplete="shipping address-line2" value={customer.line2} onChange={edit('line2')} />
            </label>
            <label className="field">
              <span>City</span>
              <input type="text" autoComplete="shipping address-level2" required value={customer.city} onChange={edit('city')} />
            </label>
            <label className="field">
              <span>Postcode</span>
              <input type="text" inputMode="numeric" autoComplete="shipping postal-code" required value={customer.postal_code} onChange={edit('postal_code')} />
            </label>
          </div>
          <p className="checkout-hint checkout-hint-region">Delivery region</p>
          <div className="ship-options" role="radiogroup" aria-label="Delivery region">
            {SHIPPING_ZONES.map((z) => (
              <label key={z} className={`ship-option${zone === z ? ' is-selected' : ''}`}>
                <input type="radio" name="zone" value={z} checked={zone === z} onChange={() => setZone(z)} />
                <span className="ship-option-name">{z}</span>
                <span className="ship-option-rate">
                  {quotes ? formatMoney(quotes[z], currency) : quoteError ? '—' : '…'}
                </span>
              </label>
            ))}
          </div>
          {quoteError && <p className="error-state">{quoteError}</p>}
        </section>

        <section className="checkout-section" aria-labelledby="checkout-reference">
          <h2 id="checkout-reference">Your reference</h2>
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
        </section>

        <section className="checkout-section" aria-labelledby="checkout-payment">
          <h2 id="checkout-payment">Payment</h2>
          <p className="checkout-hint">
            All transactions are secure and encrypted. You will enter your card details
            with Stripe.
          </p>
          {!currency && (
            <p className="cart-note">Items in different currencies check out separately.</p>
          )}
          {payError && (
            <p className="error-state">
              {payError} <a href="/cart">Review your cart</a>
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary checkout-pay"
            disabled={submitting || !quotes || !currency}
          >
            {submitting ? 'Redirecting to Stripe…' : 'Pay now'}
          </button>
          <a className="cart-continue" href="/cart">
            ‹ Return to cart
          </a>
        </section>
      </form>
    </div>
  )
}
