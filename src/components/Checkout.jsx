import { useEffect, useMemo, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { readCart, cartCount, cartSubtotalCents, cartCurrency, CART_EVENT } from '../lib/cart.js'
import { formatMoney, STORE_CURRENCY } from '../lib/money.js'
import { gstCents } from '../lib/gst.js'
import { EMPTY_CUSTOMER, customerFromPrefill, customerBody } from '../lib/checkoutCustomer.js'
import { NZ_REGIONS, RATE_ZONES, zoneForRegion } from '../lib/shipping.js'

// Checkout island (US-019), laid out like a Shopify checkout: Contact, Delivery
// and Your reference on the left, and on the right — in this order — the
// shipping method, the order summary, and Pay now directly under the total
// (page feedback, Sept 2026). The summary is a native <details>, collapsed into
// a "Show order summary" bar on phones, no JS accordion.
// Every shipping zone is quoted live from GET /shipping/quote in parallel so
// the Region field can price each region before it is chosen. The customer's contact and
// delivery details are collected HERE (Sept 2026) — a signed-in shopper starts
// from GET /checkout/prefill (account, last order, trade application) and may
// edit every field — and travel with the cart to POST /checkout/session, which
// hands them to Stripe so its page asks for nothing but the card. No prices
// are sent — only { sku, qty } per line plus the zone; the API re-resolves
// every price (see checkout.js). GST (15%, src/lib/gst.js) is shown on goods
// plus freight and charged by the API as its own line.
//
// THE REGION CHOOSES THE ZONE. The shopper picks their own New Zealand region
// (lib/shipping.js) and that single control decides the rate zone sent to the
// API, which still prices the three fixed zones seeded there (meeting decision,
// flat-rate per zone); the shipping method on the right states the rate that
// region buys. It stays ONE control among the address fields: two would be two
// answers to "where is this going", and the cheaper one would be the one the
// freight was charged at. Delivery is NZ-only, so no country field.
//
// The whole page is ONE <form>: Pay now sits in the right-hand column but
// submits the fields on the left, so native `required` / type=email validation
// still runs before payNow does.

const DESKTOP = '(min-width: 1025px)' // matches the commerce.css breakpoint

export default function Checkout() {
  const [items, setItems] = useState(null)
  const [customer, setCustomer] = useState(EMPTY_CUSTOMER)
  const [region, setRegion] = useState(NZ_REGIONS[0])
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
      RATE_ZONES.map((z) =>
        apiFetch(`/shipping/quote?zone=${encodeURIComponent(z)}&qty=${encodeURIComponent(totalQty)}`)
      )
    )
      .then((bodies) => {
        if (!active) return
        setQuotes(Object.fromEntries(RATE_ZONES.map((z, i) => [z, Number(bodies[i].rate_cents)])))
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

  const currency = cartCurrency()
  const subtotal = cartSubtotalCents(items)
  const zone = zoneForRegion(region)
  const shipping = quotes ? quotes[zone] : null
  const gst = shipping != null ? gstCents(subtotal + shipping) : null
  const total = shipping != null ? subtotal + shipping + gst : null
  const rateText = (cents) =>
    cents != null ? formatMoney(cents, currency) : quoteError ? '—' : 'Calculating…'

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
    <form className="checkout" onSubmit={payNow}>
      <div className="checkout-main">
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
            {/* Where it is going, as an address field. Each option carries the
                rate its zone buys, so the choice is priced before it is made —
                the shipping method and the totals on the right both follow it. */}
            <label className="field">
              <span>Region</span>
              <select
                autoComplete="shipping address-level1"
                required
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              >
                {NZ_REGIONS.map((name) => (
                  <option key={name} value={name}>
                    {quotes
                      ? `${name} — ${formatMoney(quotes[zoneForRegion(name)], currency)}`
                      : name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Postcode</span>
              <input type="text" inputMode="numeric" autoComplete="shipping postal-code" required value={customer.postal_code} onChange={edit('postal_code')} />
            </label>
          </div>
          {quoteError && <p className="error-state">{quoteError}</p>}
        </section>

        <section className="checkout-section" aria-labelledby="checkout-reference">
          <h2 id="checkout-reference">Your reference</h2>
          <p className="checkout-hint">
            Optional. A note for the office, and the reference or PO number you file this order under.
          </p>
          <div className="checkout-fields">
            <label className="field field-span">
              <span>Order notes</span>
              <textarea
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <label className="field field-span">
              <span>Your reference</span>
              <input
                type="text"
                maxLength={200}
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </label>
            <label className="field field-span">
              <span>Your PO number</span>
              <input
                type="text"
                maxLength={200}
                value={poNumber}
                onChange={(event) => setPoNumber(event.target.value)}
              />
            </label>
          </div>
          <a className="cart-continue" href="/cart">
            ‹ Return to cart
          </a>
        </section>
      </div>

      {/* Right column, top to bottom: shipping method, price box, Pay now.
          `display: contents` under 1025px hands these three straight to the page
          grid so the summary bar can stay at the top of a phone while Pay now
          drops below the form (commerce.css). */}
      <aside className="checkout-aside">
        <section className="checkout-method" aria-labelledby="checkout-method-heading">
          <h2 id="checkout-method-heading">Shipping method</h2>
          <div className="ship-options">
            <div className="ship-option is-selected">
              <span className="ship-option-name">{region} — flat rate</span>
              <span className="ship-option-rate">{rateText(shipping)}</span>
            </div>
          </div>
        </section>

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
                    {formatMoney((Number(line.price_cents) || 0) * (Number(line.qty) || 0), STORE_CURRENCY)}
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


        <div className="checkout-payment">
          {payError && (
            <p className="error-state">
              {payError} <a href="/cart">Review your cart</a>
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary checkout-pay"
            disabled={submitting || !quotes}
          >
            {submitting ? 'Redirecting to Stripe…' : 'Pay now'}
          </button>
          <p className="checkout-hint checkout-pay-note">
            All transactions are secure and encrypted. You will enter your card details
            with Stripe.
          </p>
        </div>
      </aside>
    </form>
  )
}
