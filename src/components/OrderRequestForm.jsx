import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'

// Order-request form island (US-020, FR-5/FR-6). Reached from a fabric product
// page as /order-request?product=<slug>[&backorder=1]. The customer asks the
// back office to cut and invoice fabric: they choose a colourway, the metres
// wanted, and free-text cut requirements, then supply contact details (prefilled
// when logged in; guests allowed). The backorder variant (out-of-stock product)
// requires an explicit "I accept the quoted lead time" checkbox before submit,
// which sets accepted_lead_time on the request.
//
// Submits to POST /orders/request. A 422 carries { message, errors: [{ field,
// message }] } with field paths like lines[0].qty_metres / contact.email, which
// are shown inline; other errors show as a form-level message. Success shows the
// request number and the "in touch within 24 hours" acknowledgement.
//
// Everything renders inside one component — the store's ESLint has no React
// plugin, so a JSX-only sub-component reference would trip no-unused-vars
// (same constraint as ProductDetail.jsx / ProductLibrary.jsx).

// Read a query-string value; safe during SSR (window undefined -> null).
function queryParam(name) {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

export default function OrderRequestForm() {
  const [productSlug] = useState(() => queryParam('product'))
  const [isBackorder] = useState(() => queryParam('backorder') === '1')
  // The product page carries the colourway the shopper was looking at, so the
  // form opens on the same SKU rather than resetting to the first in stock.
  const [requestedSku] = useState(() => queryParam('sku'))

  const [product, setProduct] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | error | none
  const [loadError, setLoadError] = useState('')

  // Form fields.
  const [sku, setSku] = useState('')
  const [metres, setMetres] = useState('')
  const [cutRequirements, setCutRequirements] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [acceptedLeadTime, setAcceptedLeadTime] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({}) // { metres, email }
  const [result, setResult] = useState(null) // { order_number, kind } on success

  // Load the product for the colourway list and heading. Also try /auth/me to
  // prefill contact details for a logged-in customer (401 = guest, ignored).
  useEffect(() => {
    if (!productSlug) {
      setStatus('none')
      return
    }
    let active = true

    apiFetch(`/catalogue/products/${encodeURIComponent(productSlug)}`)
      .then((body) => {
        if (!active) return
        const loaded = body?.product ?? null
        setProduct(loaded)
        const colourways = loaded?.colourways ?? []
        // Honour the colourway the product page linked to; otherwise default to
        // the first in-stock one, else the first listed.
        const preferred =
          colourways.find((c) => c.sku === requestedSku) ??
          colourways.find((c) => c.in_stock) ??
          colourways[0]
        if (preferred?.sku) setSku(preferred.sku)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        setLoadError(err instanceof ApiError ? err.message : 'Unable to load this product.')
        setStatus('error')
      })

    // Go through the shared helper: /auth/me answers with a { user } ENVELOPE,
    // and reading body.email off the raw response silently prefilled nothing,
    // so every signed-in customer had to retype their own contact details.
    // fetchCurrentUser never throws — a guest simply leaves the fields blank.
    fetchCurrentUser().then((user) => {
      if (!active || !user) return
      if (user.name) setName(user.name)
      if (user.email) setEmail(user.email)
    })

    return () => {
      active = false
    }
  }, [productSlug, requestedSku])

  if (status === 'none') {
    return (
      <div className="request-form">
        <p className="products-empty">Choose a fabric to request from the product library.</p>
        <a className="btn btn-primary" href="/products">
          Browse products
        </a>
      </div>
    )
  }

  if (status === 'loading') {
    return <p className="products-status">Loading request form…</p>
  }

  if (status === 'error') {
    return <p className="error-state">{loadError}</p>
  }

  if (result) {
    return (
      <div className="request-success">
        <h2>Request received</h2>
        <p>
          Your request number is <strong>{result.order_number}</strong>.
        </p>
        <p>We will be in touch within 24 hours to confirm stock, cut requirements, and pricing.</p>
        <a className="btn btn-primary" href="/products">
          Continue browsing
        </a>
      </div>
    )
  }

  const colourways = product?.colourways ?? []

  const validate = () => {
    const errors = {}
    const qty = Number(metres)
    if (!metres || !Number.isFinite(qty) || qty <= 0) {
      errors.metres = 'Enter the metres wanted (greater than 0).'
    }
    if (!sku) {
      errors.sku = 'Choose a colourway.'
    }
    if (!email.trim()) {
      errors.email = 'An email address is required so we can reply.'
    }
    if (isBackorder && !acceptedLeadTime) {
      errors.acceptedLeadTime = 'Please accept the quoted lead time to place a backorder.'
    }
    return errors
  }

  // Map API 422 field paths (lines[0].qty_metres, contact.email) to our fields.
  const applyServerErrors = (serverErrors) => {
    const mapped = {}
    for (const item of serverErrors) {
      if (typeof item?.field !== 'string') continue
      if (item.field.endsWith('qty_metres')) mapped.metres = item.message
      else if (item.field === 'contact.email') mapped.email = item.message
    }
    return mapped
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      return
    }
    setFieldErrors({})
    setSubmitting(true)

    try {
      const body = await apiFetch('/orders/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [
            {
              sku,
              qty_metres: Number(metres),
              cut_requirements: cutRequirements.trim() || null,
            },
          ],
          contact: {
            name: name.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
          accepted_lead_time: acceptedLeadTime,
        }),
      })
      setResult(body?.order ?? null)
    } catch (err) {
      const serverErrors = err instanceof ApiError ? err.body?.errors : null
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        setFieldErrors(applyServerErrors(serverErrors))
      }
      setSubmitError(
        err instanceof ApiError ? err.message : 'We could not submit your request. Please try again.'
      )
      setSubmitting(false)
    }
  }

  return (
    <form className="request-form" onSubmit={onSubmit} noValidate>
      {product && (
        <p className="request-product">
          Requesting <strong>{product.name}</strong>
          {product.brand?.name ? ` — ${product.brand.name}` : ''}
        </p>
      )}

      {isBackorder && (
        <p className="request-note">
          This item is currently out of stock.
          {product?.lead_time ? ` Estimated lead time: ${product.lead_time}.` : ' Lead time confirmed on request.'}
        </p>
      )}

      <label className="field">
        <span>Colourway</span>
        <select value={sku} onChange={(event) => setSku(event.target.value)}>
          {colourways.length === 0 && <option value="">No colourways available</option>}
          {colourways.map((colourway) => (
            <option key={colourway.sku} value={colourway.sku}>
              {colourway.name} {colourway.in_stock ? '(in stock)' : '(made to order)'}
            </option>
          ))}
        </select>
        {fieldErrors.sku && <span className="field-error">{fieldErrors.sku}</span>}
      </label>

      <label className="field">
        <span>Metres wanted</span>
        <input
          type="number"
          min="0"
          step="0.1"
          value={metres}
          onChange={(event) => setMetres(event.target.value)}
          inputMode="decimal"
        />
        {fieldErrors.metres && <span className="field-error">{fieldErrors.metres}</span>}
      </label>

      <label className="field">
        <span>Cut requirements</span>
        <textarea
          rows={4}
          value={cutRequirements}
          onChange={(event) => setCutRequirements(event.target.value)}
          placeholder="Batch shading notes, cutting instructions, delivery timing…"
        />
      </label>

      <fieldset className="field-group">
        <legend>Contact details</legend>
        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </label>
        <label className="field">
          <span>Phone</span>
          <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
      </fieldset>

      {isBackorder && (
        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={acceptedLeadTime}
            onChange={(event) => setAcceptedLeadTime(event.target.checked)}
          />
          <span>I accept the quoted lead time for this backorder.</span>
        </label>
      )}
      {fieldErrors.acceptedLeadTime && <p className="field-error">{fieldErrors.acceptedLeadTime}</p>}

      {submitError && <p className="error-state">{submitError}</p>}

      <button type="submit" className="btn btn-primary" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  )
}
