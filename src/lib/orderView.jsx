// Shared order-rendering helpers for the account history (US-022) and the guest
// order-lookup page. Both read the same order shape from atelier-api:
//   { order_number, kind, status, subtotal_cents, shipping_cents, total_cents,
//     shipping_zone, xero_invoice_ref, created_at, lines: [{ sku, product_name,
//     qty, unit_price_cents, cut_requirements }] }
//
// These are plain FUNCTIONS that return JSX and are CALLED normally
// (statusBadge(order.status), orderCard(order)) — never used as <Component/>.
// The store ESLint has no React plugin, so a JSX-only component reference would
// trip no-unused-vars; calling a function counts as a use. No hooks inside, so
// calling them directly (not rendering as elements) is safe.

import { formatMoney } from './money.js'

// Human labels + a CSS modifier class per order status.
const STATUS_META = {
  requested: { label: 'Requested', className: 'status-requested' },
  confirmed: { label: 'Confirmed', className: 'status-confirmed' },
  paid: { label: 'Paid', className: 'status-paid' },
  shipped: { label: 'Shipped', className: 'status-shipped' },
  declined: { label: 'Declined', className: 'status-declined' },
}

const KIND_LABELS = {
  checkout: 'Online order',
  order_request: 'Fabric order',
  backorder_request: 'Backorder',
}

// A small coloured status pill. Unknown statuses fall back to a neutral badge.
export function statusBadge(status) {
  const meta = STATUS_META[status] ?? { label: status ?? 'Unknown', className: 'status-unknown' }
  return (
    <span className={`status-badge ${meta.className}`}>{meta.label}</span>
  )
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

// Full order card: header (number, date, kind, status), line table, and totals.
// Shipping/total rows are omitted when their cents are null (fabric requests are
// priced later by the back office, so their totals are 0/absent until confirmed).
export function orderCard(order) {
  const currency = 'NZD'
  const lines = order.lines ?? []
  const created = formatDate(order.created_at)

  return (
    <article className="order-card" key={order.order_number}>
      <header className="order-card-head">
        <div>
          <h2 className="order-number">{order.order_number}</h2>
          <p className="order-meta">
            {KIND_LABELS[order.kind] ?? order.kind}
            {created ? ` · ${created}` : ''}
          </p>
        </div>
        {statusBadge(order.status)}
      </header>

      {lines.length > 0 ? (
        <ul className="order-lines">
          {lines.map((line, index) => {
            const qty = Number(line.qty) || 0
            const unit = Number(line.unit_price_cents) || 0
            return (
              <li key={`${line.sku}-${index}`} className="order-line">
                <div className="order-line-main">
                  <span className="order-line-name">
                    {line.product_name || line.sku}
                  </span>
                  {line.cut_requirements ? (
                    <span className="order-line-cut">{line.cut_requirements}</span>
                  ) : null}
                </div>
                <span className="order-line-qty">×{qty}</span>
                <span className="order-line-total">
                  {unit > 0 ? formatMoney(unit * qty, currency) : '—'}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="order-empty-lines">No line items on this order.</p>
      )}

      <dl className="order-totals">
        {order.subtotal_cents != null ? (
          <div>
            <dt>Subtotal</dt>
            <dd>{formatMoney(order.subtotal_cents, currency)}</dd>
          </div>
        ) : null}
        {order.shipping_cents != null && Number(order.shipping_cents) > 0 ? (
          <div>
            <dt>Shipping{order.shipping_zone ? ` (${order.shipping_zone})` : ''}</dt>
            <dd>{formatMoney(order.shipping_cents, currency)}</dd>
          </div>
        ) : null}
        {order.total_cents != null ? (
          <div className="order-total-row">
            <dt>Total</dt>
            <dd>
              {formatMoney(order.total_cents, currency)}
              <span className="indicative-note">Indicative</span>
            </dd>
          </div>
        ) : null}
        {order.xero_invoice_ref ? (
          <div>
            <dt>Invoice reference</dt>
            <dd>{order.xero_invoice_ref}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  )
}
