import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { orderCard } from '../lib/orderView.jsx'
import { canRespond, outcomeText, tokenFromLocation } from '../lib/quoteReview.js'
import { quoteActions, useQuoteAnswer } from '../lib/quoteActions.jsx'

// The page behind the `quote_sent` letter's link (24 Sep 2026). A guest has no
// account, so the signed token in ?token= is what names the quote; the island
// reads it client-side because the page is prerendered, like reset-password.
// Accept or reject (with a reason) posts to /orders/quote/:token/accept|reject;
// once answered the page says where the quote stands.
export default function QuoteReview() {
  const [token, setToken] = useState(null)
  const [state, setState] = useState({ status: 'loading', order: null, error: '' })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const found = tokenFromLocation(window.location.search)
    setToken(found)
    if (!found) {
      setState({
        status: 'error',
        order: null,
        error: 'This link is missing its quote reference. Open the link in your quote email again.',
      })
      return undefined
    }
    let active = true
    apiFetch(`/orders/quote/${encodeURIComponent(found)}`)
      .then((body) => {
        if (active) setState({ status: 'ready', order: body.order, error: '' })
      })
      .catch((err) => {
        if (!active) return
        setState({
          status: 'error',
          order: null,
          error:
            err instanceof ApiError && err.status === 404
              ? 'This quote link is no longer valid — a newer quote may have replaced it. Check your latest quote email.'
              : err.message || 'We could not load this quote.',
        })
      })
    return () => {
      active = false
    }
  }, [])

  const quote = useQuoteAnswer({
    post: (order, accept, reason) =>
      apiFetch(`/orders/quote/${encodeURIComponent(token)}/${accept ? 'accept' : 'reject'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accept ? {} : { reason }),
      }),
    onAnswered: (order) => setState({ status: 'ready', order, error: '' }),
  })

  if (state.status === 'loading') {
    return (
      <p className="quote-status" role="status">
        Loading your quote…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <p className="quote-status field-error" role="alert">
        {state.error}
      </p>
    )
  }

  const { order } = state
  return (
    <div className="quote-review">
      {orderCard(order, { open: true })}
      {canRespond(order) ? (
        quoteActions(order, { ...quote.uiFor(order), ...quote.handlersFor(order) })
      ) : (
        <div className="request-success" role="status">
          <p>{outcomeText(order)}</p>
        </div>
      )}
    </div>
  )
}
