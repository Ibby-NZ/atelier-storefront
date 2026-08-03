import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser, accountLabel } from '../lib/auth.js'
import { tradeStatusNote } from '../lib/account.js'
import { orderCard } from '../lib/orderView.jsx'

// My Account island (US-022). The store is a static build, so auth state is
// resolved at runtime. On mount:
//   1. GET /auth/me — no user (401) → redirect to /login?redirect=/account.
//   2. GET /orders/mine — the logged-in user's orders, newest first, each with
//      lines + totals + invoice reference. Ownership is enforced server-side.
// Order rendering (status badges, line table, totals) is shared with the guest
// lookup page via src/lib/orderView.jsx.
//
// Trade applicants are told where their application stands. Approval is manual
// and silent — the API just starts sending trade_price_cents one day — so
// without this a trade account looks broken to the person waiting on it, and an
// approved one is indistinguishable from a pending one.
//
// Single component (store ESLint has no React plugin); order markup lives in a
// plain function called normally (orderCard(order)), not a JSX sub-component.

// Returns null for a customer account: nothing to say about a programme they
// are not in.
function tradeNote(user) {
  const note = tradeStatusNote(user)
  if (!note) return null
  return (
    <div className={`account-trade account-trade-${note.tone}`}>
      <p className="account-trade-label">{note.label}</p>
      <p className="account-trade-text">{note.text}</p>
    </div>
  )
}

export default function Account() {
  const [state, setState] = useState({ status: 'loading', user: null, orders: [] })

  useEffect(() => {
    let active = true

    async function load() {
      const user = await fetchCurrentUser()
      if (!active) return
      if (!user) {
        // Not logged in — send them to login and come back here after.
        if (typeof window !== 'undefined') {
          window.location.href = '/login?redirect=/account'
        }
        return
      }
      try {
        const body = await apiFetch('/orders/mine')
        if (!active) return
        setState({ status: 'ready', user, orders: body?.orders ?? [] })
      } catch (err) {
        if (!active) return
        setState({
          status: 'error',
          user,
          orders: [],
          error: err instanceof ApiError ? err.message : 'Could not load your orders.',
        })
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  if (state.status === 'loading') {
    return <p className="products-status">Loading your account…</p>
  }

  if (state.status === 'error') {
    return (
      <div className="account">
        <p className="account-greeting">Signed in as {accountLabel(state.user)}</p>
        {tradeNote(state.user)}
        <p className="form-error" role="alert">
          {state.error}
        </p>
      </div>
    )
  }

  return (
    <div className="account">
      <p className="account-greeting">Signed in as {accountLabel(state.user)}</p>
      {tradeNote(state.user)}

      {state.orders.length === 0 ? (
        <div className="account-empty">
          <p className="products-empty">You have no orders yet.</p>
          <a className="btn btn-primary" href="/products">
            Browse products
          </a>
        </div>
      ) : (
        <div className="order-list">{state.orders.map((order) => orderCard(order))}</div>
      )}
    </div>
  )
}
