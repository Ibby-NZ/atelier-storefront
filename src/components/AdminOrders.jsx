import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { statusBadge } from '../lib/orderView.jsx'
import { formatMoney } from '../lib/money.js'

// Back-office order queue island (US-023, FR-7). All work happens against the
// admin endpoints (US-014) which are backoffice-only server-side; this island
// is the UI gate as well:
//   1. fetchCurrentUser() on mount. No user → /login. Not backoffice/director →
//      redirect to '/' (no broken page for customers/trade).
//   2. GET /admin/orders?status= lists orders (newest first) with lines and
//      reservation state. A status <select> re-queries.
//   3. Expand an order to edit line quantities (PATCH) and drive the lifecycle:
//      Confirm (with Xero invoice ref) / Mark Paid / Mark Shipped / Decline —
//      each is a POST that the API guards with a state machine (invalid
//      transitions 409). The list re-loads after every mutation so status,
//      totals and reservation state stay accurate.
//
// Single component (store ESLint has no React plugin, so a JSX-only
// sub-component reference would trip no-unused-vars). Sub-markup is inlined and
// all per-order draft state is lifted here.

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'requested', label: 'Requested' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'paid', label: 'Paid' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'declined', label: 'Declined' },
]

const KIND_LABELS = {
  checkout: 'Online order',
  order_request: 'Fabric order',
  backorder_request: 'Backorder',
}

// Staff can adjust line quantities only while the reservation is still held.
const EDITABLE_STATUSES = new Set(['requested', 'confirmed'])

function isBackoffice(user) {
  return user?.role === 'backoffice' || user?.role === 'director'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-NZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

export default function AdminOrders() {
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [orders, setOrders] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [lineDrafts, setLineDrafts] = useState({}) // lineId -> qty string
  const [xeroRef, setXeroRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  async function loadOrders(status) {
    const query = status ? `?status=${encodeURIComponent(status)}` : ''
    const body = await apiFetch(`/admin/orders${query}`)
    return body?.orders ?? []
  }

  // Gate on mount, then load the initial (unfiltered) list.
  useEffect(() => {
    let active = true
    async function init() {
      const user = await fetchCurrentUser()
      if (!active) return
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login?redirect=/admin/orders'
        }
        return
      }
      if (!isBackoffice(user)) {
        if (typeof window !== 'undefined') {
          window.location.href = '/'
        }
        return
      }
      try {
        const list = await loadOrders('')
        if (!active) return
        setOrders(list)
        setPhase('ready')
      } catch (err) {
        if (!active) return
        setError(err instanceof ApiError ? err.message : 'Could not load orders.')
        setPhase('error')
      }
    }
    init()
    return () => {
      active = false
    }
  }, [])

  async function refresh(status = filter) {
    setActionError('')
    try {
      const list = await loadOrders(status)
      setOrders(list)
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not refresh orders.')
    }
  }

  async function handleFilterChange(event) {
    const next = event.target.value
    setFilter(next)
    setExpandedId(null)
    await refresh(next)
  }

  function toggleExpand(order) {
    setActionError('')
    if (expandedId === order.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(order.id)
    const drafts = {}
    for (const line of order.lines ?? []) {
      drafts[line.id] = String(line.qty)
    }
    setLineDrafts(drafts)
    setXeroRef(order.xero_invoice_ref ?? '')
  }

  // Run an admin action, then re-load the list. Errors (incl. 409 invalid
  // transitions) surface inline without losing the current view.
  async function runAction(fn) {
    setBusy(true)
    setActionError('')
    try {
      await fn()
      await refresh()
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'That action could not be completed.'
      )
    } finally {
      setBusy(false)
    }
  }

  function saveLines(order) {
    const lines = (order.lines ?? []).map((line) => ({
      id: line.id,
      qty: Number(lineDrafts[line.id]),
    }))
    const invalid = lines.some((line) => !(line.qty > 0))
    if (invalid) {
      setActionError('Every line quantity must be greater than zero.')
      return
    }
    runAction(() =>
      apiFetch(`/admin/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      })
    )
  }

  function confirmOrder(order) {
    if (!xeroRef.trim()) {
      setActionError('Enter the Xero invoice reference to confirm this order.')
      return
    }
    runAction(() =>
      apiFetch(`/admin/orders/${order.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xero_invoice_ref: xeroRef.trim() }),
      })
    )
  }

  function postAction(order, path) {
    runAction(() => apiFetch(`/admin/orders/${order.id}/${path}`, { method: 'POST' }))
  }

  if (phase === 'loading') {
    return <p className="products-status">Loading orders…</p>
  }

  if (phase === 'error') {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    )
  }

  return (
    <div className="admin-orders">
      <div className="admin-toolbar">
        <label className="field admin-filter">
          <span>Filter by status</span>
          <select value={filter} onChange={handleFilterChange}>
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="admin-count">
          {orders.length} order{orders.length === 1 ? '' : 's'}
        </p>
      </div>

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {orders.length === 0 ? (
        <p className="products-empty">No orders match this filter.</p>
      ) : (
        <ul className="admin-order-list">
          {orders.map((order) => {
            const expanded = expandedId === order.id
            const editable = EDITABLE_STATUSES.has(order.status)
            const created = formatDate(order.created_at)
            return (
              <li key={order.id} className="admin-order">
                <button
                  type="button"
                  className="admin-order-head"
                  aria-expanded={expanded}
                  onClick={() => toggleExpand(order)}
                >
                  <span className="admin-order-number">{order.order_number}</span>
                  <span className="admin-order-kind">
                    {KIND_LABELS[order.kind] ?? order.kind}
                  </span>
                  <span className="admin-order-customer">
                    {order.guest_email || (order.user_id ? `User #${order.user_id}` : 'Guest')}
                  </span>
                  <span className="admin-order-date">{created}</span>
                  {statusBadge(order.status)}
                </button>

                {expanded && (
                  <div className="admin-order-detail">
                    <table className="admin-lines">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Cut / notes</th>
                          <th>Stock</th>
                          <th>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(order.lines ?? []).map((line) => (
                          <tr key={line.id}>
                            <td>{line.product_name || '—'}</td>
                            <td>{line.sku}</td>
                            <td>{line.cut_requirements || '—'}</td>
                            <td>
                              {line.inventory
                                ? `${Number(line.inventory.qty_available)} avail · ${Number(
                                    line.inventory.qty_reserved
                                  )} reserved`
                                : '—'}
                            </td>
                            <td>
                              {editable ? (
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  className="admin-qty-input"
                                  value={lineDrafts[line.id] ?? ''}
                                  onChange={(e) =>
                                    setLineDrafts((prev) => ({
                                      ...prev,
                                      [line.id]: e.target.value,
                                    }))
                                  }
                                  disabled={busy}
                                />
                              ) : (
                                Number(line.qty)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <dl className="admin-order-totals">
                      <div>
                        <dt>Subtotal</dt>
                        <dd>{formatMoney(order.subtotal_cents)}</dd>
                      </div>
                      <div>
                        <dt>Shipping{order.shipping_zone ? ` (${order.shipping_zone})` : ''}</dt>
                        <dd>{formatMoney(order.shipping_cents)}</dd>
                      </div>
                      <div className="order-total-row">
                        <dt>Total</dt>
                        <dd>{formatMoney(order.total_cents)}</dd>
                      </div>
                      <div>
                        <dt>Reservation</dt>
                        <dd>{order.reservation_state}</dd>
                      </div>
                      {order.xero_invoice_ref ? (
                        <div>
                          <dt>Invoice reference</dt>
                          <dd>{order.xero_invoice_ref}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className="admin-actions">
                      {editable && (
                        <button
                          type="button"
                          className="btn"
                          disabled={busy}
                          onClick={() => saveLines(order)}
                        >
                          Save line quantities
                        </button>
                      )}

                      {order.status === 'requested' && (
                        <div className="admin-confirm">
                          <label className="field">
                            <span>Xero invoice reference</span>
                            <input
                              type="text"
                              value={xeroRef}
                              placeholder="e.g. INV-1042"
                              onChange={(e) => setXeroRef(e.target.value)}
                              disabled={busy}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={busy}
                            onClick={() => confirmOrder(order)}
                          >
                            Confirm
                          </button>
                        </div>
                      )}

                      {order.status === 'confirmed' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => postAction(order, 'mark-paid')}
                        >
                          Mark paid
                        </button>
                      )}

                      {order.status === 'paid' && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => postAction(order, 'ship')}
                        >
                          Mark shipped
                        </button>
                      )}

                      {(order.status === 'requested' || order.status === 'confirmed') && (
                        <button
                          type="button"
                          className="btn btn-danger"
                          disabled={busy}
                          onClick={() => postAction(order, 'decline')}
                        >
                          Decline
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
