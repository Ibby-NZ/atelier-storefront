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
import { MIN_PASSWORD_LENGTH } from './passwordReset.js'
import { BUSINESS_TYPES, TRADE_DETAIL_SECTIONS } from './tradeDetails.js'

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
 * Account details, the password change, and the sign-out control.
 *
 * Name and phone are the client's own to edit (PATCH /auth/me). The EMAIL is
 * not: it is the login identity, a collision on it is the office's to resolve,
 * and the rules for that live behind PATCH /admin/users/:id. So it is shown
 * with the sentence that says who to ask, not as a disabled input that reads
 * as a field the page has broken.
 *
 * UNCONTROLLED INPUTS, read off the form on submit. No panel in this file may
 * hold a hook — they are called conditionally from the island's renderPanel —
 * and threading five controlled values back through the island would be five
 * more pieces of state for two forms that are read once each.
 *
 * Log out lives here rather than in the header: the 2026 chrome gives the header
 * a single 24px account icon with no room for a button, so this is the only
 * place a signed-in visitor can end their session.
 *
 * @param {{ user: object, summary: object|null, onLogout: Function,
 *           loggingOut: boolean, onSaveDetails: Function,
 *           detailsState: { status: string, error: string },
 *           tradeDetails: object|null, onSaveTradeDetails: Function|null }} props
 *
 * Changing a password is NOT here any more — it has a section of its own
 * (passwordPanel, 16 Sep 2026).
 */
export function detailsPanel({
  user,
  summary,
  onLogout,
  loggingOut,
  onSaveDetails,
  detailsState,
  tradeDetails = null,
  onSaveTradeDetails = null,
}) {
  return (
    <div className="account-details">
      {tradeDetails && onSaveTradeDetails ? tradeDetailsForm({ tradeDetails, onSaveTradeDetails }) : null}
      <form className="account-detail-form" onSubmit={onSaveDetails} noValidate>
        <fieldset className="field-group">
          <legend>Your details</legend>
          <label className="field">
            <span>Name</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              maxLength={200}
              defaultValue={user.name ?? ''}
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              maxLength={40}
              defaultValue={user.phone ?? ''}
            />
          </label>
          <div className="field">
            <span>Email</span>
            <p className="account-detail-static">{user.email}</p>
            <span className="field-hint">
              This is what you sign in with. To change it, contact us and we will update it for you.
            </span>
          </div>
          {summary?.trade_account?.company_name ? (
            <div className="field">
              <span>Account</span>
              <p className="account-detail-static">{summary.trade_account.company_name}</p>
            </div>
          ) : null}
        </fieldset>

        {detailsState.error ? (
          <p className="error-state" role="alert">{detailsState.error}</p>
        ) : null}
        {detailsState.status === 'saved' ? (
          <p className="field-hint" role="status">Your details are saved.</p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={detailsState.status === 'saving'}>
          {detailsState.status === 'saving' ? 'Saving…' : 'Save details'}
        </button>
      </form>


      {accountManagerBlock(summary?.trade_account?.account_manager)}

      <p className="account-detail-note">
        To add a colleague to this account, or to change anything else on your record, contact us
        and we will update it.
      </p>

      <button type="button" className="btn btn-ghost" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </div>
  )
}


/* --- Trade details ----------------------------------------------------------
   The client's own application, editable (16 Sep 2026). Uncontrolled inputs
   with defaultValue, the details form's own idiom; the PATCH body is built off
   FormData by tradeDetailsPatch. Keyed on the loaded row's updated_at so a
   fresh save re-seeds the defaults. */
function tradeField(field, application, errors) {
  const error = errors?.[field.key]
  const value = application?.[field.key]
  const className = `field${field.wide ? ' field-wide' : ''}${field.kind === 'bool' ? ' field-checkbox' : ''}`
  if (field.kind === 'bool') {
    return (
      <label className={className} key={field.key}>
        <input type="checkbox" name={field.key} defaultChecked={value === true} />
        <span>{field.label}</span>
      </label>
    )
  }
  return (
    <label className={className} key={field.key}>
      <span>{field.label}</span>
      {field.kind === 'textarea' ? (
        <textarea name={field.key} rows={2} maxLength={2000} defaultValue={value ?? ''} />
      ) : field.kind === 'business_type' ? (
        <select name={field.key} defaultValue={value ?? ''}>
          <option value="">Choose…</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      ) : (
        <input type={field.kind} name={field.key} maxLength={2000} defaultValue={value ?? ''} />
      )}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}

function tradeDetailsForm({ tradeDetails, onSaveTradeDetails }) {
  if (tradeDetails.status === 'loading' || tradeDetails.status === 'idle') {
    return <p className="products-status">Loading your trade details…</p>
  }
  if (tradeDetails.status === 'none') {
    return (
      <p className="account-panel-note">
        Your trade account was set up by our office, so there is no application form to edit
        here. Contact us to change your business details.
      </p>
    )
  }
  if (tradeDetails.status === 'error' && !tradeDetails.application) {
    return (
      <p className="error-state" role="alert">
        {tradeDetails.error}
      </p>
    )
  }
  const { application, errors } = tradeDetails
  return (
    <form
      className="account-detail-form account-trade-form"
      onSubmit={onSaveTradeDetails}
      noValidate
      key={application?.updated_at ?? application?.id ?? 'trade'}
    >
      <fieldset className="field-group">
        <legend>Trade details</legend>
        <p className="field-hint">
          What you told us when you applied. Keep it current — the office reads it when it
          sends your samples and invoices.
        </p>
      </fieldset>
      {TRADE_DETAIL_SECTIONS.map((section) => (
        <fieldset className="field-group" key={section.title}>
          <legend>{section.title}</legend>
          <div className="account-trade-grid">
            {section.fields.map((field) => tradeField(field, application, errors))}
          </div>
        </fieldset>
      ))}
      {tradeDetails.error ? (
        <p className="error-state" role="alert">
          {tradeDetails.error}
        </p>
      ) : null}
      {tradeDetails.status === 'saved' ? (
        <p className="field-hint" role="status">
          Your trade details are saved.
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={tradeDetails.status === 'saving'}>
        {tradeDetails.status === 'saving' ? 'Saving…' : 'Save trade details'}
      </button>
    </form>
  )
}

/* --- Password --------------------------------------------------------------
   Its own section since 16 Sep 2026. It was a <details> under the account form,
   where the client could not find it; every account has a password, so the tab
   is never gated. */
export function passwordPanel({ onChangePassword, passwordState }) {
  return (
    <div className="account-details">
      <form className="account-detail-form" onSubmit={onChangePassword} noValidate>
        <fieldset className="field-group">
          <legend className="sr-only">Change password</legend>
          <label className="field">
            <span>Current password</span>
            <input type="password" name="current_password" autoComplete="current-password" />
          </label>
          <label className="field">
            <span>New password</span>
            <input type="password" name="new_password" autoComplete="new-password" />
            <span className="field-hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input type="password" name="confirm_password" autoComplete="new-password" />
          </label>
        </fieldset>

        {passwordState.error ? (
          <p className="error-state" role="alert">{passwordState.error}</p>
        ) : null}
        {passwordState.status === 'saved' ? (
          <p className="field-hint" role="status">
            Your password has been changed. You stay signed in here.
          </p>
        ) : null}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={passwordState.status === 'saving'}
        >
          {passwordState.status === 'saving' ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}
