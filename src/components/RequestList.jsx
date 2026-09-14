import { useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { honeypotField } from './honeypotField.jsx'
import { fetchCurrentUser } from '../lib/auth.js'
import {
  REQUEST_EVENT,
  METRES_STEP,
  MAX_METRES,
  readRequestList,
  addToRequestList,
  setRequestMetres,
  setRequestNote,
  removeFromRequestList,
  clearRequestList,
  replaceRequestList,
  applyProductRefresh,
  hasBackorderLine,
  hasUnavailableLine,
  requestTotalMetres,
  toRequestPayloadLines,
  normaliseMetres,
} from '../lib/requestList.js'

// Request-list island (US-020, FR-5/FR-6) — the cut-to-order flow as a CART,
// not as a form.
//
// It used to be one form per product: a shopper who wanted three cloths sent
// three separate requests, and the back office received three orders to
// reconcile by hand. Now the fabric product page adds a colourway to a
// localStorage list (src/lib/requestList.js) exactly as a finished good is added
// to the cart, and this page is where the whole list is reviewed — metres and
// cut requirements per line, remove, add another — and submitted ONCE as the
// multi-line `POST /orders/request` the API has always accepted.
//
// Why a second list rather than the cart: fabric is decimal metres, carries
// per-line cut requirements, has no price until the back office quotes one, and
// ends in a request rather than a Stripe payment. See requestList.js.
//
// Three things the page does on arrival:
//   1. Honours the legacy deep link `?product=<slug>[&sku=][&backorder=1]` by
//      adding that colourway to the list, then stripping the query so a refresh
//      cannot add it twice. Old links (and anything the client has bookmarked)
//      keep working.
//   2. Re-fetches every product in the list. Stock state decides whether the
//      lead-time checkbox is required, and a list built last week must not
//      submit last week's answer. A SKU the live product no longer lists is
//      flagged rather than sent — it would 422 the whole request.
//   3. Prefills name/email/phone from `GET /auth/me` (401 = guest, ignored).
//      The phone is the number the last request saved against the account, so
//      the client is not asked for it twice.
//
// Everything renders inside one component — the store's ESLint has no React
// plugin, so a JSX-only sub-component reference would trip no-unused-vars
// (same constraint as ProductDetail.jsx / ProductLibrary.jsx).

// Read a query-string value; safe during SSR (window undefined -> null).
function queryParam(name) {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

// Drop the deep-link query without a navigation, so a reload does not re-add.
function stripQuery() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  window.history.replaceState({}, '', window.location.pathname)
}

// The colourway a deep link should land on: the one it named, else the first in
// stock, else the first listed.
function pickColourway(product, wantedSku) {
  const colourways = product?.colourways ?? []
  return (
    colourways.find((entry) => entry.sku === wantedSku) ??
    colourways.find((entry) => entry.in_stock) ??
    colourways[0] ??
    null
  )
}

export default function RequestList() {
  const [items, setItems] = useState(null) // null until hydrated (avoids SSR flash)
  const [drafts, setDrafts] = useState({}) // sku -> in-progress metres text

  const [website, setWebsite] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  // The client's own numbers for this job, carried through to the order so the
  // back office can quote against them. Both optional, both free text.
  const [clientReference, setClientReference] = useState('')
  const [customerPoNumber, setCustomerPoNumber] = useState('')
  const [acceptedLeadTime, setAcceptedLeadTime] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({}) // { email, acceptedLeadTime }
  const [lineErrors, setLineErrors] = useState({}) // sku -> message
  // The API decides shortness against real quantities, not our in_stock flag: a
  // colourway with 2m left reads "in stock" here and is still short for a 40m
  // cut. When it says so, the checkbox has to appear whatever our snapshot said.
  const [leadTimeForced, setLeadTimeForced] = useState(false)
  const [result, setResult] = useState(null) // { order_number, kind } on success

  // Read once so the effect below cannot re-run on a URL change it made itself.
  const [deepLinkSlug] = useState(() => queryParam('product'))
  const [deepLinkSku] = useState(() => queryParam('sku'))
  const [deepLinkFailed, setDeepLinkFailed] = useState(false)
  const deepLinkDone = useRef(false)

  // Hydrate, honour the deep link, then refresh every line against the API.
  useEffect(() => {
    let active = true

    const addDeepLink = async () => {
      try {
        const body = await apiFetch(`/catalogue/products/${encodeURIComponent(deepLinkSlug)}`)
        const product = body?.product ?? null
        const colourway = pickColourway(product, deepLinkSku)
        if (!product || !colourway) return null
        return addToRequestList(
          {
            sku: colourway.sku,
            slug: product.slug,
            name: product.name,
            brand: product.brand?.name ?? null,
            colourway: colourway.name,
            image_url: colourway.image_url ?? product.hi_res_asset_url ?? null,
            in_stock: colourway.in_stock === true,
            lead_time: product.lead_time ?? null,
          },
          1
        )
      } catch {
        // A dead API must not lose the list the shopper already has.
        return null
      }
    }

    const refresh = async (list) => {
      const slugs = [...new Set(list.map((line) => line.slug).filter(Boolean))]
      if (slugs.length === 0) return null
      const bySlug = new Map()
      await Promise.all(
        slugs.map(async (slug) => {
          try {
            const body = await apiFetch(`/catalogue/products/${encodeURIComponent(slug)}`)
            bySlug.set(slug, body?.product ?? null)
          } catch (err) {
            // Only a confirmed 404 means the product is gone. Any other failure
            // leaves the slug out of the map, and its lines untouched.
            if (err instanceof ApiError && err.status === 404) bySlug.set(slug, null)
          }
        })
      )
      return applyProductRefresh(list, bySlug)
    }

    const run = async () => {
      let list = readRequestList()
      if (deepLinkSlug && !deepLinkDone.current) {
        deepLinkDone.current = true
        stripQuery()
        const added = await addDeepLink()
        // A bookmarked link that quietly adds nothing looks like a broken page,
        // especially when the list was empty to begin with.
        if (added) list = added
        else if (active) setDeepLinkFailed(true)
      }
      if (!active) return
      setItems(list)
      const refreshed = await refresh(list)
      if (!active || !refreshed) return
      setItems(replaceRequestList(refreshed))
    }

    run()
    return () => {
      active = false
    }
  }, [deepLinkSlug, deepLinkSku])

  // The list is the localStorage array; every mutation writes there and this
  // brings the render back in step — including changes made in another tab.
  useEffect(() => {
    const sync = () => setItems(readRequestList())
    window.addEventListener(REQUEST_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(REQUEST_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // /auth/me answers with a { user } envelope; fetchCurrentUser unwraps it and
  // never throws — a guest simply leaves the fields blank.
  useEffect(() => {
    let active = true
    fetchCurrentUser().then((user) => {
      if (!active || !user) return
      if (user.name) setName(user.name)
      if (user.email) setEmail(user.email)
      if (user.phone) setPhone(user.phone)
    })
    return () => {
      active = false
    }
  }, [])

  if (result) {
    const backorder = result.kind === 'backorder_request'
    return (
      <div className="request-success">
        <h2>{backorder ? 'Backorder request received' : 'Request received'}</h2>
        <p>
          Your request number is <strong>{result.order_number}</strong>.
        </p>
        <p>
          We will be in touch within 24 hours to confirm stock, cut requirements, and pricing
          {backorder ? ', and to confirm the lead time on the items we are backordering.' : '.'}
        </p>
        <a className="btn btn-primary" href="/products">
          Continue browsing
        </a>
      </div>
    )
  }

  if (items === null) {
    return <p className="products-status">Loading your request list…</p>
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        {deepLinkFailed && (
          <p className="error-state">
            We could not add that fabric — it may no longer be listed. Please choose it from the
            library.
          </p>
        )}
        <p className="products-empty">Your request list is empty.</p>
        <p className="cart-note">
          Choose a fabric and the colourway you want, set the metres, and add it here. You can
          add as many as you like and send them as one request.
        </p>
        <a className="btn btn-primary" href="/products">
          Browse the library
        </a>
      </div>
    )
  }

  const totalMetres = requestTotalMetres(items)
  const anyBackorder = hasBackorderLine(items)
  const anyUnavailable = hasUnavailableLine(items)
  const needsLeadTime = anyBackorder || leadTimeForced

  const changeMetres = (sku, value) => {
    setDrafts((current) => ({ ...current, [sku]: value }))
    // Commit only a usable figure. '' and '0.' are keystrokes on the way to
    // '0.5'; the stored metres simply stay at their last good value.
    if (normaliseMetres(value) > 0) setRequestMetres(sku, value)
  }

  // Snap the field back to what is actually stored once editing stops, so a
  // half-typed value never lingers on screen as though it had been saved.
  const settleMetres = (sku) =>
    setDrafts((current) => {
      if (!(sku in current)) return current
      const next = { ...current }
      delete next[sku]
      return next
    })

  const remove = (sku) => {
    removeFromRequestList(sku)
    settleMetres(sku)
  }

  const validate = () => {
    const errors = {}
    const lines = {}
    for (const line of items) {
      if (line.unavailable) {
        lines[line.sku] = 'No longer available — remove this line to send your request.'
      } else if (normaliseMetres(line.metres) === 0) {
        lines[line.sku] = 'Enter the metres wanted (greater than 0).'
      }
    }
    if (!email.trim()) {
      errors.email = 'An email address is required so we can reply.'
    }
    if (needsLeadTime && !acceptedLeadTime) {
      errors.acceptedLeadTime = 'Please accept the quoted lead time to place a backorder.'
    }
    return { errors, lines }
  }

  // Map API 422 field paths (lines[0].qty_metres, contact.email) back onto the
  // line they came from — the index is this list's own order, which is what was
  // posted.
  const applyServerErrors = (serverErrors) => {
    const errors = {}
    const lines = {}
    for (const item of serverErrors) {
      if (typeof item?.field !== 'string') continue
      const match = item.field.match(/^lines\[(\d+)\]/)
      if (match) {
        const line = items[Number(match[1])]
        if (line) lines[line.sku] = item.message
      } else if (item.field === 'contact.email') {
        errors.email = item.message
      }
    }
    return { errors, lines }
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const { errors, lines } = validate()
    if (Object.keys(errors).length > 0 || Object.keys(lines).length > 0) {
      setFieldErrors(errors)
      setLineErrors(lines)
      return
    }
    setFieldErrors({})
    setLineErrors({})
    setSubmitting(true)

    try {
      const body = await apiFetch('/orders/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: website || undefined,
          lines: toRequestPayloadLines(items),
          contact: {
            name: name.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
          client_reference: clientReference.trim() || undefined,
          customer_po_number: customerPoNumber.trim() || undefined,
          accepted_lead_time: acceptedLeadTime,
        }),
      })
      setResult(body?.order ?? null)
      // The request now lives server-side; leaving the list behind would invite
      // a second identical request on the next visit.
      clearRequestList()
    } catch (err) {
      const serverErrors = err instanceof ApiError ? err.body?.errors : null
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        const mapped = applyServerErrors(serverErrors)
        setFieldErrors(mapped.errors)
        setLineErrors(mapped.lines)
      }
      const message =
        err instanceof ApiError
          ? err.message
          : 'We could not submit your request. Please try again.'
      // The API refuses a short line unless the lead time is accepted, whatever
      // our stock snapshot said — reveal the checkbox rather than leaving the
      // shopper to re-press a button that will fail again.
      if (/lead time/i.test(message)) setLeadTimeForced(true)
      setSubmitError(message)
      setSubmitting(false)
    }
  }

  return (
    <form className="request-list" onSubmit={onSubmit} noValidate>
      {honeypotField(website, setWebsite)}
      <div className="request-list-lines">
        {deepLinkFailed && (
          <p className="error-state">
            We could not add the fabric that link pointed to — it may no longer be listed. The
            rest of your list is below.
          </p>
        )}

        <ul className="cart-lines">
          {items.map((line) => {
            const label = line.name || line.sku
            return (
              <li
                key={line.sku}
                className={line.unavailable ? 'cart-line request-line is-unavailable' : 'cart-line request-line'}
              >
                <div className="cart-line-media">
                  {line.image_url ? (
                    <img className="cart-line-image" src={line.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="cart-line-image product-image-placeholder" aria-hidden="true" />
                  )}
                </div>

                <div className="cart-line-main">
                  {line.brand && <p className="cart-line-brand">{line.brand}</p>}
                  <p className="cart-line-name">
                    {line.slug ? (
                      <a className="cart-line-link" href={`/products/${line.slug}`}>
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                    {line.colourway && <span className="cart-line-colourway"> — {line.colourway}</span>}
                  </p>
                  <p className="cart-line-unit">
                    <span className={line.in_stock ? 'request-stock in' : 'request-stock out'}>
                      {line.in_stock ? 'In stock' : 'Made to order'}
                    </span>
                    <span className="detail-selected-sku">{line.sku}</span>
                  </p>
                  {!line.in_stock && line.lead_time && (
                    <p className="request-line-lead">Lead time: {line.lead_time}</p>
                  )}
                </div>

                <label className="cart-qty request-metres">
                  <span className="request-metres-label">Metres</span>
                  <input
                    type="number"
                    min={METRES_STEP}
                    max={MAX_METRES}
                    step={METRES_STEP}
                    inputMode="decimal"
                    aria-label={`Metres of ${label}`}
                    aria-invalid={lineErrors[line.sku] ? 'true' : undefined}
                    value={drafts[line.sku] ?? String(line.metres)}
                    onChange={(event) => changeMetres(line.sku, event.target.value)}
                    onBlur={() => settleMetres(line.sku)}
                  />
                </label>

                <button
                  type="button"
                  className="cart-remove"
                  onClick={() => remove(line.sku)}
                  aria-label={`Remove ${label}`}
                >
                  Remove
                </button>

                <label className="field request-line-note">
                  <span>Cut requirements</span>
                  <textarea
                    rows={2}
                    value={line.cut_requirements ?? ''}
                    onChange={(event) => setRequestNote(line.sku, event.target.value)}
                    placeholder="Batch shading notes, cutting instructions, delivery timing…"
                  />
                </label>

                {lineErrors[line.sku] && <p className="field-error request-line-error">{lineErrors[line.sku]}</p>}
              </li>
            )
          })}
        </ul>

        <a className="cart-continue" href="/products">
          Add another fabric
        </a>
      </div>

      <aside className="cart-summary request-summary">
        <p className="cart-subtotal">
          <span>{items.length === 1 ? '1 cloth' : `${items.length} cloths`}</span>
          <strong>
            {totalMetres}
            <span className="request-metres-unit"> m</span>
          </strong>
        </p>
        <p className="cart-note">
          Cut to order and priced on confirmation — nothing is charged here. We verify stock and
          batch shading, then invoice.
        </p>

        <fieldset className="field-group">
          <legend>Your details</legend>
          <label className="field">
            <span>Name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </label>
          <label className="field">
            <span>Phone</span>
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label className="field">
            <span>Your reference (optional)</span>
            <input
              type="text"
              maxLength={200}
              value={clientReference}
              onChange={(event) => setClientReference(event.target.value)}
              placeholder="What you call this job — a room, a project, a name"
            />
          </label>
          <label className="field">
            <span>Your PO number (optional)</span>
            <input
              type="text"
              maxLength={200}
              value={customerPoNumber}
              onChange={(event) => setCustomerPoNumber(event.target.value)}
            />
          </label>
        </fieldset>

        {needsLeadTime && (
          <>
            <p className="request-note">
              {anyBackorder
                ? 'Some of these are made to order and will be backordered.'
                : 'Some of these are short on available stock and will be backordered.'}
            </p>
            <label className="field field-checkbox">
              <input
                type="checkbox"
                checked={acceptedLeadTime}
                onChange={(event) => setAcceptedLeadTime(event.target.checked)}
              />
              <span>I accept the quoted lead time for this backorder.</span>
            </label>
          </>
        )}
        {fieldErrors.acceptedLeadTime && <p className="field-error">{fieldErrors.acceptedLeadTime}</p>}

        {anyUnavailable && (
          <p className="error-state">
            One or more cloths are no longer listed. Remove them to send your request.
          </p>
        )}
        {submitError && <p className="error-state">{submitError}</p>}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send request'}
        </button>
      </aside>
    </form>
  )
}
