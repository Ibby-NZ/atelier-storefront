// The sample enquiry cart, reviewed and sent (16 Sep 2026). The lines come from
// localStorage (lib/sampleList.js); the contact block prefills from the session
// for a signed-in shopper; one POST /samples/request sends the lot, which lands
// in the CRM as a pending sample request and emails both the shopper and the
// office. Guests are welcome — the API wants an email and nothing else.

import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { honeypotField } from './honeypotField.jsx'
import {
  SAMPLE_EVENT,
  clearSampleList,
  readSampleList,
  removeFromSampleList,
  setSampleNote,
  toSamplePayloadLines,
} from '../lib/sampleList.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SampleRequestList() {
  const [items, setItems] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [website, setWebsite] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    const sync = () => setItems(readSampleList())
    sync()
    window.addEventListener(SAMPLE_EVENT, sync)
    return () => window.removeEventListener(SAMPLE_EVENT, sync)
  }, [])

  // fetchCurrentUser never throws — a guest simply leaves the fields blank.
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

  const onSubmit = async (event) => {
    event.preventDefault()
    setSubmitError('')
    const errors = {}
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      errors.email = 'Tell us where to send the samples — an email address.'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setSubmitting(true)
    try {
      const body = await apiFetch('/samples/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: website || undefined,
          lines: toSamplePayloadLines(items),
          contact: {
            name: name.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
          },
          notes: notes.trim() || undefined,
        }),
      })
      setResult(body?.sample_request ?? null)
      // The request now lives server-side; leaving the list behind would invite
      // a second identical request on the next visit.
      clearSampleList()
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'We could not send your request. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="request-success">
        <h2>Sample request received</h2>
        <p>
          Your reference is <strong>{result.request_number}</strong>. We have emailed a copy to{' '}
          {result.contact_email}.
        </p>
        <p>We will confirm what is available and send your cuttings out shortly.</p>
        <a className="btn btn-primary" href="/products">
          Continue browsing
        </a>
      </div>
    )
  }

  if (items === null) {
    return <p className="products-status">Loading your sample request…</p>
  }

  if (items.length === 0) {
    return (
      <div className="cart-empty">
        <p className="products-empty">Your sample request is empty.</p>
        <p className="cart-note">
          Choose a fabric and the colourway you would like a cutting of, and press “Request a
          sample”. Add as many as you like and send them as one request.
        </p>
        <a className="btn btn-primary" href="/products">
          Browse the library
        </a>
      </div>
    )
  }

  // The figure (page feedback, Sept 2026): two halves on the container — the
  // cuttings as a hairline list on the left, each a thumbnail, the house
  // badge, the name and colourway, the SKU and a one-line note; the details
  // form on a surface panel on the right, the contact page's panel exactly,
  // so the two forms on the site read as one. No fieldset box, no legend.
  return (
    <form className="sample-request" onSubmit={onSubmit} noValidate>
      {honeypotField(website, setWebsite)}
      <div className="sample-lines-col">
        <div className="sample-lines-head">
          <h2>{items.length === 1 ? '1 cutting' : `${items.length} cuttings`}</h2>
          <a className="cta-underline" href="/products">
            Add another
          </a>
        </div>
        <ul className="sample-lines">
          {items.map((line) => {
            const label = line.name || line.sku
            return (
              <li key={line.sku} className="sample-line">
                <div className="sample-line-media">
                  {line.image_url ? (
                    <img className="sample-line-image" src={line.image_url} alt="" loading="lazy" />
                  ) : (
                    <span className="sample-line-image product-image-placeholder" aria-hidden="true" />
                  )}
                </div>
                <div className="sample-line-main">
                  {line.brand && <p className="badge-ochre">{line.brand}</p>}
                  <p className="sample-line-name">
                    {line.slug ? (
                      <a className="sample-line-link" href={`/products/${line.slug}`}>
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                  </p>
                  <p className="sample-line-meta">
                    {line.colourway && <span>{line.colourway}</span>}
                    <span className="sample-line-sku">{line.sku}</span>
                  </p>
                  <label className="sample-line-note">
                    <span className="sr-only">Note for {label}</span>
                    <input
                      type="text"
                      maxLength={500}
                      value={line.note ?? ''}
                      onChange={(event) => setSampleNote(line.sku, event.target.value)}
                      placeholder="Add a note — anything that helps us pick the right cutting"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="sample-line-remove"
                  onClick={() => removeFromSampleList(line.sku)}
                  aria-label={`Remove ${label}`}
                >
                  Remove
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <section className="sample-panel" aria-label="Your details">
        <h2>Where to send them</h2>
        <p className="sample-panel-note">
          Nothing is charged — cuttings go out free of charge and we confirm by email.
        </p>

        <label className="field">
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            aria-invalid={fieldErrors.email ? 'true' : undefined}
          />
          {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
        </label>
        <label className="field">
          <span>Phone (optional)</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </label>
        <label className="field">
          <span>Delivery address and anything else</span>
          <textarea
            rows={5}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where to send them, and the project they are for…"
          />
        </label>

        {submitError && (
          <p className="error-state" role="alert">
            {submitError}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Request samples'}
        </button>
      </section>
    </form>
  )
}
