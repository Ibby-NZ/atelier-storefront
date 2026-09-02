import { useEffect, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import {
  BESPOKE_HOUSES,
  PRICE_VALIDITY_NOTE,
  findBespokeHouse,
  bespokeEnquiryPayload,
} from '../lib/bespoke.js'

// Bespoke page island: a wall of house cards driving a gallery + blurb, with
// the enquiry form beneath. Nothing here shows a price — every bespoke piece is
// quoted by the back office, and the enquiry posts to POST /contact with the
// house and category carried in the subject line (mirrors ContactForm.jsx:
// client validation, inline 422 field errors, success panel). One component per
// file — the store's ESLint has no React plugin, so a JSX-only sub-component
// reference would trip no-unused-vars.
//
// The wall replaced a house dropdown (Userback, Sept 2026: a picker made a
// reader work to find out what bespoke even is). It stays the five commissioning
// houses of BESPOKE_HOUSES, NOT the catalogue's brand list — every card here is
// a promise that the house takes commissions.

export default function BespokeExplorer() {
  // No house until one is picked: the wall is the page's opening, and the
  // enquiry form has no subject line to write without a house.
  const [slug, setSlug] = useState(null)
  const house = findBespokeHouse(slug)
  const detail = useRef(null)

  const [category, setCategory] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({}) // { name, email, message }
  const [sent, setSent] = useState(false)

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

  // Runs on the pick, not in the click handler: the panel is not in the DOM
  // until the state has landed, so there is nothing to scroll to any earlier.
  useEffect(() => {
    if (!slug) return
    detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [slug])

  const selectHouse = (nextSlug) => {
    setSlug(nextSlug)
    setCategory('') // categories belong to one house; a stale one would mislabel the enquiry
  }

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
    setSubmitError('')
    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      return
    }
    setFieldErrors({})
    setSubmitting(true)

    try {
      await apiFetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bespokeEnquiryPayload({ house, category, name, email, phone, message })),
      })
      setSent(true)
    } catch (err) {
      const serverErrors = err instanceof ApiError ? err.body?.errors : null
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        setFieldErrors(applyServerErrors(serverErrors))
      }
      setSubmitError(
        err instanceof ApiError
          ? err.message
          : 'We could not send your enquiry. Please try again.'
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="bespoke-explorer">
      <ul className="bespoke-wall">
        {BESPOKE_HOUSES.map((option) => (
          <li key={option.slug}>
            {/* alt="" because the house name is set over the photograph — the
                button reads out its name and what it makes, not the picture. */}
            <button
              type="button"
              className="bespoke-card"
              aria-pressed={option.slug === slug}
              onClick={() => selectHouse(option.slug)}
            >
              <span className="bespoke-card-media">
                <img src={option.images[0].src} alt="" loading="lazy" />
                <span className="bespoke-card-logo">{option.name}</span>
              </span>
              <span className="bespoke-card-made">{option.categories.join(' · ')}</span>
            </button>
          </li>
        ))}
      </ul>

      {house && (
        <>
          <section className="bespoke-house" aria-live="polite" ref={detail}>
            <h2>{house.name}</h2>
            <p className="bespoke-categories">Made to measure: {house.categories.join(' · ')}</p>
            <p className="bespoke-blurb">{house.blurb}</p>

            <div className="bespoke-gallery">
              {house.images.map((image) => (
                <figure key={image.src} className="bespoke-tile">
                  <img src={image.src} alt={image.alt} loading="lazy" />
                </figure>
              ))}
            </div>
          </section>

          <section className="bespoke-enquiry" aria-label="Bespoke enquiry">
            {sent ? (
              <div className="request-success" role="status">
                <h2>Thank you</h2>
                <p>
                  Your bespoke enquiry has been sent. A member of our team will come
                  back to you with a quote within one business day.
                </p>
                <p className="bespoke-note">{PRICE_VALIDITY_NOTE}</p>
                <a className="btn btn-primary" href="/products">
                  Browse the collection
                </a>
              </div>
            ) : (
              <form className="contact-form" onSubmit={onSubmit} noValidate>
                <h2>Enquire about {house.name}</h2>
                <p className="bespoke-form-lede">
                  Every piece is quoted individually. Tell us what you have in mind
                  and we will come back to you with a price.
                </p>

                {house.categories.length > 1 && (
                  <label className="field">
                    <span>What are you interested in? (optional)</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">All of the above</option>
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
        </>
      )}
    </div>
  )
}
