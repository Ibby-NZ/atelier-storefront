import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { orderCard } from '../lib/orderView.jsx'

// Guest order-lookup island (US-022). A visitor without an account enters an
// order number + the email the order was placed with; GET /orders/lookup returns
// the single matching order or 404. Both keys are required — a mismatch on either
// is a 404 (never a distinguishable signal), so there is no order enumeration.
//
// Single component (store ESLint has no React plugin); the found order is
// rendered via the shared plain function orderCard(order).

export default function OrderLookupForm() {
  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState(null)
  const [message, setMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setOrder(null)

    if (!orderNumber.trim() || !email.trim()) {
      setMessage('Enter your order number and the email used on the order.')
      return
    }

    setSubmitting(true)
    try {
      const query = new URLSearchParams({
        order_number: orderNumber.trim(),
        email: email.trim(),
      })
      const body = await apiFetch(`/orders/lookup?${query.toString()}`)
      setOrder(body?.order ?? null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setMessage('No order matches that number and email. Check both and try again.')
      } else {
        setMessage(
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="order-lookup">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}

        <label className="field">
          <span>Order number</span>
          <input
            type="text"
            name="order_number"
            placeholder="WEB-… / REQ-… / BO-…"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Searching…' : 'Find my order'}
        </button>
      </form>

      {order ? <div className="order-list">{orderCard(order)}</div> : null}
    </div>
  )
}
