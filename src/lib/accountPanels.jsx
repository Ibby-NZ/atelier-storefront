// The account portal's panels, as plain functions returning JSX.
//
// Same convention as orderView.jsx and for the same reason: the store's ESLint
// config has no React plugin, so a JSX-only component reference trips
// no-unused-vars. These are CALLED (samplesPanel(props)), never rendered as
// <SamplesPanel/>. No hooks inside any of them — all state lives in the island.
//
// FRAMING IS PART OF THE CODE HERE. Two of these panels show data that is
// genuinely partial, and saying so is not decoration:
//   - Samples are the D365 CUTTINGS register. The staged export begins 2025-04-08
//     and carries no due-back date, so a ten-year client sees the last sixteen
//     months. The panel says what it is showing rather than implying it is
//     everything.
//   - Invoices are HEADERS ONLY. There are no line items (the export is
//     header-grain and line import is shelved) and no payment state (the staged
//     status is a dispatch state, and FR-8 forbids calling Xero). So the panel is
//     an invoice RECORD, never a statement — no balance, no aging, no "paid"
//     badge — with a request-a-copy action where the PDF download would be.

import { formatAmount } from './money.js'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-NZ', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/** The panel body while a section's own fetch is in flight. */
export function panelLoading(label) {
  return <p className="products-status">Loading your {label}…</p>
}

export function panelError(message) {
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  )
}

/**
 * What a panel shows when the login has not been matched to a Dynamics customer.
 * Not an error and not an empty list — both would be a lie about the record.
 */
export function pendingLinkNotice(text) {
  return (
    <div className="account-notice">
      <p className="account-notice-label">Account setup in progress</p>
      <p className="account-notice-text">{text}</p>
    </div>
  )
}

export function panelEmpty(text) {
  return <p className="products-empty">{text}</p>
}

/**
 * "Showing 20 of 681 · Show more", or nothing when the list is complete.
 *
 * The record panels state a total, so they owe the client a way to reach it.
 * Without this a designer with ten years of invoices is told there are 681 and
 * shown the first twenty with no control of any kind.
 */
export function moreControl({ shown, total, loading, onMore }) {
  if (shown >= total) return null
  return (
    <div className="account-more">
      <p className="account-table-meta">
        Showing {shown} of {total}
      </p>
      <button type="button" className="btn btn-ghost" disabled={loading} onClick={onMore}>
        {loading ? 'Loading…' : 'Show more'}
      </button>
    </div>
  )
}

/**
 * The assigned account manager, or the showroom.
 *
 * Falls back to a generic contact rather than inventing an attribution: the
 * Dynamics `owner` column is a shared login on 72% of accounts, so deriving a
 * name from it would put the wrong person in front of most clients.
 */
export function accountManagerBlock(manager) {
  if (!manager || (!manager.name && !manager.email && !manager.phone)) {
    return (
      <div className="account-manager">
        <p className="account-manager-label">Your contact</p>
        <p className="account-manager-name">The Atelier showroom</p>
        <p className="account-manager-lines">
          <a href="/contact">Send us a message</a>
        </p>
      </div>
    )
  }
  return (
    <div className="account-manager">
      <p className="account-manager-label">Your account manager</p>
      {manager.name ? <p className="account-manager-name">{manager.name}</p> : null}
      <p className="account-manager-lines">
        {manager.email ? <a href={`mailto:${manager.email}`}>{manager.email}</a> : null}
        {manager.email && manager.phone ? <span aria-hidden="true"> · </span> : null}
        {manager.phone ? <a href={`tel:${manager.phone.replace(/\s+/g, '')}`}>{manager.phone}</a> : null}
      </p>
    </div>
  )
}

/** One headline figure on the overview. */
function statTile(label, value, hint) {
  return (
    <div className="account-stat" key={label}>
      <p className="account-stat-value">{value}</p>
      <p className="account-stat-label">{label}</p>
      {hint ? <p className="account-stat-hint">{hint}</p> : null}
    </div>
  )
}

/**
 * The overview: who the client is, their counts, and their contact.
 *
 * @param {{ summary: object|null, user: object, onSection: (id: string) => void }} props
 */
export function dashboardPanel({ summary, user, onSection }) {
  const company = summary?.trade_account?.company_name
  return (
    <div className="account-dashboard">
      <div className="account-identity">
        <p className="account-identity-label">{summary ? 'Trade account' : 'Account'}</p>
        <p className="account-identity-name">{company || user.name || user.email}</p>
        {company && user.name ? <p className="account-identity-sub">{user.name}</p> : null}
      </div>

      {summary ? (
        <div className="account-stats">
          {statTile('Orders placed here', summary.orders?.total ?? 0)}
          {statTile(
            'Cuttings on record',
            summary.samples?.total ?? 0,
            summary.trade_account?.linked ? null : 'Pending account setup'
          )}
          {statTile(
            'Invoices on record',
            summary.invoices?.total ?? 0,
            summary.invoices?.latest_invoice_date
              ? `Latest ${formatDate(summary.invoices.latest_invoice_date)}`
              : summary.trade_account?.linked
                ? null
                : 'Pending account setup'
          )}
        </div>
      ) : null}

      {accountManagerBlock(summary?.trade_account?.account_manager)}

      <div className="account-quick-links">
        <button type="button" className="btn btn-primary" onClick={() => onSection('orders')}>
          View orders
        </button>
        <a className="btn btn-ghost" href="/products">
          Browse the library
        </a>
      </div>
    </div>
  )
}

/**
 * Sample history — the client's cuttings out of the Dynamics register.
 *
 * @param {{ samples: object[] }} props
 */
export function samplesPanel({ samples }) {
  return (
    <div className="account-table-wrap">
      <p className="account-panel-note">
        Cuttings recorded against your account. Our register was migrated in April 2025, so
        anything sampled before then is not shown here — ask your contact and we will look it up.
      </p>
      <table className="account-table">
        <thead>
          <tr>
            <th scope="col">Design</th>
            <th scope="col">Supplier</th>
            <th scope="col">Colour</th>
            <th scope="col">Taken</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((sample) => (
            <tr key={sample.id}>
              <td>
                <span className="account-cell-strong">{sample.product || sample.name || '—'}</span>
                {sample.range ? <span className="account-cell-sub">{sample.range}</span> : null}
              </td>
              <td>{sample.supplier || '—'}</td>
              <td>{sample.colour_code || '—'}</td>
              <td>{formatDate(sample.created_on)}</td>
              <td>{sample.status || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The invoice RECORD. Deliberately not a statement — see the header note.
 *
 * @param {{ invoices: object[], onRequestCopy: Function,
 *           requesting: string|null, requested: string[] }} props
 */
export function invoicesPanel({ invoices, onRequestCopy, requesting, requested }) {
  return (
    <div className="account-table-wrap">
      <p className="account-panel-note">
        A record of the invoices raised against your account. Amounts and dates come from our
        system; the invoice itself, with its line detail, is the copy our accounts team sends
        you — ask for it below and we will email it.
      </p>
      <table className="account-table">
        <thead>
          <tr>
            <th scope="col">Invoice</th>
            <th scope="col">Date</th>
            <th scope="col">Reference</th>
            <th scope="col">Total</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <span className="account-cell-strong">{invoice.number || '—'}</span>
                {invoice.suffix ? <span className="account-cell-sub">{invoice.suffix}</span> : null}
              </td>
              <td>{formatDate(invoice.invoice_date)}</td>
              <td>{invoice.reference || invoice.sales_order || '—'}</td>
              <td>{formatAmount(invoice.total_incl_gst, invoice.currency)}</td>
              <td className="account-table-action">
                {requested.includes(invoice.id) ? (
                  <span className="account-requested">Copy requested</span>
                ) : (
                  <button
                    type="button"
                    className="account-link-button"
                    disabled={requesting === invoice.id}
                    onClick={() => onRequestCopy(invoice)}
                  >
                    {requesting === invoice.id ? 'Requesting…' : 'Request a copy'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Per-house trade price lists, with a CSV download per house.
 *
 * The download is fetched through the API helper and handed to the browser as a
 * Blob rather than being a bare <a href>. The session cookie is SameSite=Lax, so
 * a plain link WOULD authenticate — which is the problem: any third-party page
 * could then trigger a credentialed download under the client's session. Going
 * through fetch keeps the request same-origin-initiated and CORS-checked.
 *
 * @param {{ brands: object[], onDownload: Function, downloading: string|null }} props
 */
export function priceListsPanel({ brands, onDownload, downloading }) {
  return (
    <div className="account-price-lists">
      <p className="account-panel-note">
        Your trade prices by house, in New Zealand dollars, excluding GST and freight.
      </p>
      <ul className="account-list">
        {brands.map((brand) => (
          <li key={brand.slug} className="account-list-row">
            <div>
              <span className="account-cell-strong">{brand.name}</span>
              <span className="account-cell-sub">
                {brand.design_count} designs · {brand.item_count} prices
              </span>
            </div>
            <button
              type="button"
              className="account-link-button"
              disabled={downloading === brand.slug}
              onClick={() => onDownload(brand)}
            >
              {downloading === brand.slug ? 'Preparing…' : 'Download (CSV)'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Account details + the sign-out control.
 *
 * Log out lives here rather than in the header: the 2026 chrome gives the header
 * a single 24px account icon with no room for a button, so this is the only
 * place a signed-in visitor can end their session.
 */
export function detailsPanel({ user, summary, onLogout, loggingOut }) {
  return (
    <div className="account-details">
      <dl className="account-detail-list">
        <div>
          <dt>Name</dt>
          <dd>{user.name || '—'}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        {summary?.trade_account?.company_name ? (
          <div>
            <dt>Account</dt>
            <dd>{summary.trade_account.company_name}</dd>
          </div>
        ) : null}
      </dl>

      {accountManagerBlock(summary?.trade_account?.account_manager)}

      <p className="account-detail-note">
        To change your details, or add a colleague to this account, contact us and we will
        update them.
      </p>

      <button type="button" className="btn btn-ghost" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  )
}
