// Shared order-rendering helpers for the account history (US-022). Reads the
// order shape from atelier-api's /orders/mine:
//   { order_number, kind, status, subtotal_cents, shipping_cents, gst_cents,
//     total_cents, shipping_zone, xero_invoice_ref, created_at, lines: [{ sku,
//     product_name, qty, unit_price_cents, cut_requirements }] }
//
// These are plain FUNCTIONS that return JSX and are CALLED normally
// (statusBadge(order.status), orderCard(order)) — never used as <Component/>.
// The store ESLint has no React plugin, so a JSX-only component reference would
// trip no-unused-vars; calling a function counts as a use. No hooks inside, so
// calling them directly (not rendering as elements) is safe.

import { formatMoney, STORE_CURRENCY } from './money.js'
import { hasQuotedTotal } from './reorder.js'

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
  // An order the office keyed for this client — a phone call, a walk-in, a
  // bespoke enquiry. It printed as the raw column value ("manual") on the
  // client's own summary row.
  manual: 'Sales order',
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
// "Brand · Design — Colour" is how the office and the catalogue name a cloth;
// the bare product name ("04620") that used to print here meant nothing to the
// client who ordered it (Userback 8367797).
const lineTitle = (line) => {
  const name = line.product_name || line.sku
  return line.colourway_name && line.colourway_name !== name
    ? `${name} — ${line.colourway_name}`
    : name
}

const unitLabel = (line) => (line.product_type === 'fabric' ? 'per metre' : 'each')

// The office's discount comes off the GOODS only, never freight — the same
// formula the API uses (discountedTotalCents in atelier-api). Shown as its own
// row so a $700 subtotal and a $665 total no longer look like an arithmetic
// error (Userback 8367809).
export const discountCents = (order) => {
  const pct = Number(order.discount_pct) || 0
  const subtotal = Number(order.subtotal_cents) || 0
  return pct > 0 && subtotal > 0 ? Math.round(subtotal * (pct / 100)) : 0
}

// A card COLLAPSES (16 Sep 2026): a client with dozens of orders had to scroll
// past every line of every one of them to reach the next. The summary carries
// what identifies an order at a glance — number, kind, date, status, total —
// and the lines and totals open under it.
//
// A native <details>, so it needs no JavaScript and no state: keyboard and
// screen-reader behaviour come free, and the `open` prop is what lets a linked
// order (#orders/<number>) arrive already expanded.
export function orderCard(order, { open = false } = {}) {
  const currency = STORE_CURRENCY
  const lines = order.lines ?? []
  const created = formatDate(order.created_at)
  const priced = hasQuotedTotal(order)

  return (
    <details className="order-card" key={order.order_number} open={open}>
      <summary className="order-card-head">
        <div>
          <h2 className="order-number">{order.order_number}</h2>
          <p className="order-meta">
            {KIND_LABELS[order.kind] ?? order.kind}
            {created ? ` · ${created}` : ''}
            {lines.length > 0 ? ` · ${lines.length === 1 ? '1 item' : `${lines.length} items`}` : ''}
          </p>
        </div>
        <span className="order-card-head-right">
          {/* The figure the summary is worth reading for. An unpriced request
              says so rather than printing the $0.00 its columns hold. */}
          <span className="order-summary-total">
            {priced ? formatMoney(order.total_cents, currency) : 'Priced on confirmation'}
          </span>
          {statusBadge(order.status)}
        </span>
      </summary>

      {lines.length > 0 ? (
        <ul className="order-lines">
          {lines.map((line, index) => {
            const qty = Number(line.qty) || 0
            const unit = Number(line.unit_price_cents) || 0
            return (
              <li key={`${line.sku}-${index}`} className="order-line">
                <div className="order-line-main">
                  {line.brand_name ? (
                    <span className="order-line-brand">{line.brand_name}</span>
                  ) : null}
                  <span className="order-line-name">
                    {line.slug ? (
                      <a href={`/products/${line.slug}`}>{lineTitle(line)}</a>
                    ) : (
                      lineTitle(line)
                    )}
                  </span>
                  <span className="order-line-cut">
                    {line.sku}
                    {unit > 0 ? ` · ${formatMoney(unit, currency)} ${unitLabel(line)}` : ''}
                  </span>
                  {line.cut_requirements ? (
                    <span className="order-line-cut">{line.cut_requirements}</span>
                  ) : null}
                </div>
                <span className="order-line-qty">
                  {line.product_type === 'fabric' ? `${qty} m` : `×${qty}`}
                </span>
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

      {/* A cut-to-order request is created with every money column at ZERO and
          nothing ever fills them in — the amount is set by hand in Xero when the
          back office confirms it. Printing those verbatim puts "$0.00" on every
          fabric order a designer ever placed, which reads as a bug rather than
          as "not priced yet". So an unpriced order says so in words, and the
          test is the TOTAL, not the status: the zeros survive confirmation,
          payment and shipping, which are exactly the orders a client opens. */}
      {priced ? (
        <dl className="order-totals">
          {order.subtotal_cents != null ? (
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(order.subtotal_cents, currency)}</dd>
            </div>
          ) : null}
          {discountCents(order) > 0 ? (
            <div className="order-discount-row">
              <dt>Discount ({Number(order.discount_pct)}%)</dt>
              <dd>−{formatMoney(discountCents(order), currency)}</dd>
            </div>
          ) : null}
          {order.shipping_cents != null && Number(order.shipping_cents) > 0 ? (
            <div>
              <dt>Shipping{order.shipping_zone ? ` (${order.shipping_zone})` : ''}</dt>
              <dd>{formatMoney(order.shipping_cents, currency)}</dd>
            </div>
          ) : null}
          {/* Only a card checkout stores gst_cents (charged as its own Stripe
              line, inside total_cents). A fabric request is priced ex-GST and
              the invoice states the tax, so its 0 stays hidden rather than
              printing "GST $0.00" on an order that will carry GST. */}
          {Number(order.gst_cents) > 0 ? (
            <div>
              <dt>GST 15%</dt>
              <dd>{formatMoney(order.gst_cents, currency)}</dd>
            </div>
          ) : null}
          <div className="order-total-row">
            <dt>Total</dt>
            <dd>
              {formatMoney(order.total_cents, currency)}
              <span className="indicative-note">Indicative</span>
            </dd>
          </div>
          {order.xero_invoice_ref ? (
            <div>
              <dt>Invoice reference</dt>
              <dd>{order.xero_invoice_ref}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <dl className="order-totals">
          <div className="order-total-row">
            <dt>Total</dt>
            <dd className="order-total-pending">
              {order.xero_invoice_ref ? 'See invoice' : 'Priced on confirmation'}
            </dd>
          </div>
          {order.xero_invoice_ref ? (
            <div>
              <dt>Invoice reference</dt>
              <dd>{order.xero_invoice_ref}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </details>
  )
}
