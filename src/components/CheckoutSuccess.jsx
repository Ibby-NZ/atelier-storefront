import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { clearCart, shouldClearCartAfterFailedVerify } from '../lib/cart.js'
import { formatMoney } from '../lib/money.js'

// Checkout success island (US-019). Stripe redirects here with ?session_id=...
// after payment. We verify the session with the API (GET /checkout/session/:id)
// and show the order, then clear the cart.
//
// THE ORDER NUMBER IS NO LONGER DERIVABLE FROM THE SESSION ID. It is a human
// `WEB-XXXXXXXX` minted when the Stripe webhook writes the order, so a redirect
// that beats the webhook here gets `pending: true` with `order_number: null`.
// That is normal, not an error: we say "Confirming your order…" and re-ask every
// two seconds for thirty, then fall back to the email, which always carries the
// number. The interval is cleared on unmount — this page is a client-side
// navigation away from the rest of the store, so a leaked timer would keep
// polling the API for the rest of the session.

const POLL_MS = 2000
const POLL_LIMIT = 15 // 15 × 2 s = the 30 s we wait for the webhook

function readSessionId() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('session_id') || ''
}

// The delivery address Stripe collected, as one line. Parts Stripe did not
// collect are dropped rather than printed as gaps.
function addressLine(address) {
  if (!address) return ''
  return [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(' '),
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

export default function CheckoutSuccess() {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  // True when the verify failed on OUR side, so the payment may well have gone
  // through. Drives both the reassurance below and where the button leads: the
  // cart has been emptied in that case, so "back to cart" would be a dead end.
  const [mayHavePaid, setMayHavePaid] = useState(false)
  // The thirty seconds are up (or a poll failed) and the order still has no
  // number: stop waiting and point at the email instead.
  const [gaveUp, setGaveUp] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const sessionId = readSessionId()
    if (!sessionId) {
      setError('We could not find your checkout session.')
      setStatus('error')
      return
    }
    let active = true
    let timer = null
    let settled = false
    let polls = 0
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }

    function poll() {
      polls += 1
      if (polls > POLL_LIMIT) {
        stop()
        setGaveUp(true)
        return
      }
      load()
    }

    const load = () =>
      apiFetch(`/checkout/session/${encodeURIComponent(sessionId)}`)
        .then((body) => {
          if (!active) return
          setSummary(body)
          setStatus('ready')
          if (!settled) {
            settled = true
            // Payment complete — empty the cart so it is not re-purchased.
            clearCart()
          }
          // No number yet means the webhook has not landed; keep asking.
          if (body?.order_number) stop()
          else if (!timer) timer = setInterval(poll, POLL_MS)
        })
        .catch((err) => {
          if (!active) return
          stop()
          // A poll that fails AFTER the page is already showing tells the shopper
          // nothing new — the payment is confirmed on screen. Keep what is there
          // and stop waiting for the number.
          if (settled) {
            setGaveUp(true)
            return
          }
          // A FAILED VERIFY IS NOT A FAILED PAYMENT, and the difference decides
          // whether the basket may stay. Stripe redirects here only after taking
          // the money, so on this path the shopper has very likely paid; leaving
          // a full cart behind them is what turns our outage into their second
          // charge, especially as the branch below offers a way onward.
          //
          // 404 is the one answer that says otherwise: the API reached Stripe and
          // Stripe does not know this session (a hand-made or stale link). That
          // is an UNVOUCHED session, the case the cart is deliberately kept for,
          // so it is left alone — a crafted link must not be able to empty a
          // shopper's basket.
          //
          // Every other failure (network error, 5xx, 503 with cards switched off)
          // is OUR side not answering, which says nothing about the payment. The
          // basket is the cheap thing to lose there and the charge is not.
          if (shouldClearCartAfterFailedVerify(err)) {
            clearCart()
            setMayHavePaid(true)
          }
          setError(err instanceof ApiError ? err.message : 'We could not verify your payment.')
          setStatus('error')
        })

    load()
    return () => {
      active = false
      stop()
    }
  }, [])

  // Only decides whether the "View in my account" link is offered — a guest has
  // no account page to send them to. Never blocks the confirmation.
  useEffect(() => {
    let active = true
    fetchCurrentUser()
      .then((user) => {
        if (active) setSignedIn(Boolean(user))
      })
      .catch(() => {
        // fetchCurrentUser only throws on unexpected (non-API) errors; the link
        // is optional, so treat it as logged out.
        if (active) setSignedIn(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (status === 'loading') {
    return <p className="products-status">Confirming your payment…</p>
  }

  if (status === 'error') {
    return (
      <div>
        <p className="error-state">{error}</p>
        {mayHavePaid ? (
          <>
            <p className="purchase-note">
              If your payment went through, your order is confirmed and a receipt
              will follow by email — please do not pay again. Contact us if one
              does not arrive.
            </p>
            <a className="cta-underline" href="/products">
              Continue shopping
            </a>
          </>
        ) : (
          <a className="btn btn-primary" href="/cart">
            Back to cart
          </a>
        )}
      </div>
    )
  }

  const lines = summary?.lines ?? []
  const deliverTo = addressLine(summary?.shipping_address)

  return (
    <div className="checkout-success">
      <h1>Thank you for your order</h1>
      {summary?.paid ? (
        <p className="success-paid">Your payment was received.</p>
      ) : (
        <p className="purchase-note">
          Your payment is being processed. You will receive an email confirmation shortly.
        </p>
      )}
      {summary?.order_number ? (
        <p className="success-order">
          Order reference: <strong>{summary.order_number}</strong>
        </p>
      ) : gaveUp ? (
        <p className="purchase-note">
          We have your payment — the confirmation email carries your order number.
        </p>
      ) : (
        <p className="success-order">Confirming your order…</p>
      )}
      {summary?.amount_total_cents != null && (
        <p className="success-total">
          Total paid: {formatMoney(summary.amount_total_cents, summary.currency)}
        </p>
      )}
      {lines.length > 0 && (
        <ul className="checkout-lines">
          {lines.map((line, index) => (
            <li key={`${line.sku ?? 'line'}-${index}`} className="checkout-line">
              <span>
                {line.name || line.sku}
                {line.name && line.sku ? ` — ${line.sku}` : ''} × {line.qty}
              </span>
              <span>{formatMoney(line.unit_price_cents, summary.currency)} each</span>
            </li>
          ))}
        </ul>
      )}
      {deliverTo && <p className="purchase-note">Delivering to {deliverTo}.</p>}
      {summary?.email && (
        <p className="purchase-note">A receipt has been sent to {summary.email}.</p>
      )}
      <a className="cta-underline" href="/products">
        Continue shopping
      </a>
      {signedIn && (
        <p className="purchase-note">
          <a className="cart-continue" href="/account">
            View in my account
          </a>
        </p>
      )}
    </div>
  )
}
