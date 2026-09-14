import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { honeypotField } from './honeypotField.jsx'
import { fetchCurrentUser } from '../lib/auth.js'
import { PRICE_VALIDITY_NOTE, blankEnquiryState, bespokeEnquiryPayload } from '../lib/bespoke.js'

// The bespoke quote enquiry form, on the page of a house the CRM flags
// `bespoke` (/brands/[slug]). Nothing here shows a price — every bespoke piece
// is quoted by the back office, and the enquiry posts to POST /contact with the
// house and category carried in the subject line (mirrors ContactForm.jsx:
// client validation, inline 422 field errors, success panel).
//
// It used to be the bottom half of a /bespoke island that opened under a wall
// of house cards on a click (Userback, Sept 2026: the panel was off screen and
// the cards read as buttons). The wall's cards now link to the house page, and
// the form lives here beside the house copy. `house` is `bespokeHouseFor(brand)`:
// the CRM's name plus the editorial categories, which may be empty.
//
// Single component by design: the store ESLint has no React plugin, so a
// JSX-only sub-component reference would trip no-unused-vars.

export default function BespokeEnquiry({ house }) {
  const [website, setWebsite] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  // ONE object for everything that belongs to the submission: category,
  // submitting, submitError, fieldErrors ({ name, email, message }) and sent.
  const [enquiry, setEnquiry] = useState(blankEnquiryState)
  const { category, submitting, submitError, fieldErrors, sent } = enquiry
  const updateEnquiry = (patch) => setEnquiry((previous) => ({ ...previous, ...patch }))

  useEffect(() => {
    let active = true
    fetchCurrentUser().then((user) => {
      if (!active || !user) return
      if (user.name) setName(user.name)
      if (user.email) setEmail(user.email)
    })
    return () => {
      active = false
    }
  }, [])

  const validate = () => {
    const errors = {}
    if (!name.trim()) errors.name = 'Please tell us your name.'
    if (!email.trim()) errors.email = 'A valid email is required.'
    if (!message.trim()) errors.message = 'Please tell us about the piece you have in mind.'
    return errors
  }

  const applyServerErrors = (serverErrors) => {
    const mapped = {}
    for (const item of serverErrors) {
      if (typeof item?.field !== 'string') continue
      if (['name', 'email', 'message'].includes(item.field)) {
        mapped[item.field] = item.message
      }
    }
    return mapped
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      updateEnquiry({ submitError: '', fieldErrors: clientErrors })
      return
    }
    updateEnquiry({ submitError: '', fieldErrors: {}, submitting: true })

    try {
      await apiFetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: website || undefined,
          ...bespokeEnquiryPayload({ house, category, name, email, phone, message }),
        }),
      })
      updateEnquiry({ submitting: false, sent: true })
    } catch (err) {
      const serverErrors = err instanceof ApiError ? err.body?.errors : null
      const mapped =
        Array.isArray(serverErrors) && serverErrors.length > 0
          ? applyServerErrors(serverErrors)
          : null
      updateEnquiry({
        submitting: false,
        submitError:
          err instanceof ApiError
            ? err.message
            : 'We could not send your enquiry. Please try again.',
        ...(mapped && { fieldErrors: mapped }),
      })
    }
  }

  return (
    <section className="bespoke-enquiry" aria-label="Bespoke enquiry">
      {sent ? (
        <div className="request-success" role="status">
          <h2>Thank you</h2>
          <p>
            Your bespoke enquiry has been sent. A member of our team will come back to you
            with a quote within one business day.
          </p>
          <p className="bespoke-note">{PRICE_VALIDITY_NOTE}</p>
          <a className="btn btn-primary" href="/products">
            Browse the collection
          </a>
        </div>
      ) : (
        <form className="contact-form" onSubmit={onSubmit} noValidate>
          {honeypotField(website, setWebsite)}
          <h2>Made to measure</h2>
          <p className="bespoke-form-lede">
            {house.name} makes pieces entirely to order. Every piece is quoted individually:
            tell us what you have in mind and we will come back to you with a price.
          </p>

          {house.categories.length > 1 && (
            <label className="field">
              <span>What are you interested in? (optional)</span>
              <select value={category} onChange={(e) => updateEnquiry({ category: e.target.value })}>
                {/* "All of the above" was the FIRST option, so "above" was
                    nothing (Userback, 14 Sep 2026). The empty value is the
                    payload contract (lib/bespoke.js) — only the label changes. */}
                <option value="">Not sure yet — anything</option>
                {house.categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
          </label>

          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
          </label>

          <label className="field">
            <span>Phone (optional)</span>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          </label>

          <label className="field">
            <span>Your brief</span>
            <textarea
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Sizes, colours, the room it's for: anything that helps us shape the quote…"
            />
            {fieldErrors.message && <span className="field-error">{fieldErrors.message}</span>}
          </label>

          {submitError && <p className="error-state">{submitError}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Sending…' : 'Request a quote'}
          </button>
          <p className="bespoke-note">{PRICE_VALIDITY_NOTE}</p>
        </form>
      )}
    </section>
  )
}
