import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { clearCart, shouldClearCartAfterFailedVerify } from '../lib/cart.js'
import { formatMoney } from '../lib/money.js'

// Checkout success island (US-019). Stripe redirects here with ?session_id=...
// after payment. We verify the session with the API (GET /checkout/session/:id)
// and show the order number, then clear the cart. The order itself is created
// asynchronously by the Stripe webhook; the order number is deterministic
// (`WEB-<session id>`), so it can be shown immediately without waiting.

function readSessionId() {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('session_id') || ''
}

export default function CheckoutSuccess() {
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')
  // True when the verify failed on OUR side, so the payment may well have gone
  // through. Drives both the reassurance below and where the button leads: the
  // cart has been emptied in that case, so "back to cart" would be a dead end.
  const [mayHavePaid, setMayHavePaid] = useState(false)

  useEffect(() => {
    const sessionId = readSessionId()
    if (!sessionId) {
      setError('We could not find your checkout session.')
      setStatus('error')
      return
    }
    let active = true
    apiFetch(`/checkout/session/${encodeURIComponent(sessionId)}`)
      .then((body) => {
        if (!active) return
        setSummary(body)
        setStatus('ready')
        // Payment complete — empty the cart so it is not re-purchased.
        clearCart()
      })
      .catch((err) => {
        if (!active) return
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
            <a className="btn btn-primary" href="/products">
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
      <p className="success-order">
        Order reference: <strong>{summary?.order_number}</strong>
      </p>
      {summary?.amount_total_cents != null && (
        <p className="success-total">
          Total paid: {formatMoney(summary.amount_total_cents, summary.currency)}
        </p>
      )}
      {summary?.email && (
        <p className="purchase-note">A receipt has been sent to {summary.email}.</p>
      )}
      <a className="btn btn-primary" href="/products">
        Continue shopping
      </a>
    </div>
  )
}
