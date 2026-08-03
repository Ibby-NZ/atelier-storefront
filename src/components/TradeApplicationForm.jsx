import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'

// Trade-application island (US-021, FR-3). Carries the full atelier.co.nz
// trade-account-application form — customer details, accounts + design
// contacts, communication preferences, trading account details, a trade
// reference and the Terms of Trade consent block — alongside the login
// credentials. Posts { name?, email, password, application } to
// POST /auth/trade-application, which creates the role=trade account
// (trade_approved=false — approval is MANUAL, the back office reviews the form
// in the CRM's Applicants tab) and stores the form. On success we do NOT
// redirect; the confirmation explains the manual approval. Field errors follow
// the ContactForm pattern: client-side validation plus the API's 422
// { errors: [{ field, message }] } mapped inline (the server prefixes form
// fields with `application.`). Single component (store ESLint has no React
// plugin), so the repeated markup comes from plain helper functions, not
// sub-components.

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const BUSINESS_TYPES = [
  ['limited_liability_company', 'Limited Liability Company'],
  ['sole_trader', 'Sole Trader'],
  ['partnership', 'Partnership'],
]
const YES_NO = [
  ['yes', 'Yes'],
  ['no', 'No'],
]

// Text inputs by section; `optional` fields skip the required check, `email`
// ones get format-checked, `textarea` renders multi-line.
const TEXT_SECTIONS = [
  {
    legend: 'Customer details',
    fields: [
      { key: 'business_name', label: 'Business name', autoComplete: 'organization' },
      { key: 'registered_name', label: 'Registered name (if different)', optional: true },
      { key: 'postal_address', label: 'Postal address', textarea: true },
      { key: 'delivery_address', label: 'Delivery address', textarea: true },
      { key: 'landline_phone', label: 'Landline phone number', type: 'tel' },
      { key: 'mobile_phone', label: 'Mobile phone number', type: 'tel' },
    ],
  },
  {
    legend: 'Accounts contact',
    fields: [
      { key: 'accounts_contact_name', label: 'Accounts contact name' },
      { key: 'accounts_contact_person', label: 'Accounts contact person' },
      { key: 'accounts_email', label: 'Accounts email address', type: 'email', email: true },
    ],
  },
  {
    legend: 'Design contact',
    fields: [
      { key: 'design_contact_name', label: 'Design contact name' },
      { key: 'design_contact_email', label: 'Design contact email', type: 'email', email: true },
      { key: 'design_contact_phone', label: 'Design contact phone number', type: 'tel' },
      { key: 'design_qualifications', label: 'Design qualifications' },
    ],
  },
]

const ALL_TEXT_FIELDS = TEXT_SECTIONS.flatMap((s) => s.fields)

const INITIAL_FORM = {
  // Login
  name: '',
  email: '',
  password: '',
  // Section text fields
  ...Object.fromEntries(ALL_TEXT_FIELDS.map((f) => [f.key, ''])),
  // Communication preferences
  mailchimp_opt_in: '',
  primary_contact_email: '',
  wants_showroom_visit: false,
  wants_account_manager: false,
  // Trading account details
  nzbn: '',
  business_type: '',
  registered_office_address: '',
  directors_names_addresses: '',
  directors_dates_of_birth: '',
  cash_account_acceptable: '',
  // Trade reference
  trade_reference: '',
  // Consent
  terms_accepted: false,
  customer_full_name: '',
  signatory_name: '',
  signatory_position: '',
  signature: '',
}

// Required plain-text fields outside TEXT_SECTIONS (rendered by hand below).
const EXTRA_REQUIRED_TEXT = [
  'nzbn',
  'registered_office_address',
  'directors_names_addresses',
  'directors_dates_of_birth',
  'trade_reference',
  'customer_full_name',
  'signatory_name',
  'signatory_position',
  'signature',
]

// The application object's field names, for building the payload and for
// mapping the server's `application.*` 422 paths back onto inputs.
const APPLICATION_TEXT_KEYS = [
  ...ALL_TEXT_FIELDS.map((f) => f.key),
  'primary_contact_email',
  ...EXTRA_REQUIRED_TEXT,
]

export default function TradeApplicationForm() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const validate = () => {
    const errors = {}
    if (!form.email.trim()) errors.email = 'Enter your email.'
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`
    }
    for (const field of ALL_TEXT_FIELDS) {
      if (field.optional) continue
      if (!form[field.key].trim()) errors[field.key] = 'Required.'
      else if (field.email && !EMAIL_RE.test(form[field.key].trim())) {
        errors[field.key] = 'A valid email is required.'
      }
    }
    for (const key of EXTRA_REQUIRED_TEXT) {
      if (!form[key].trim()) errors[key] = 'Required.'
    }
    if (!EMAIL_RE.test(form.primary_contact_email.trim())) {
      errors.primary_contact_email = 'A valid email is required.'
    }
    if (!form.mailchimp_opt_in) errors.mailchimp_opt_in = 'Please choose an option.'
    if (!form.cash_account_acceptable) {
      errors.cash_account_acceptable = 'Please choose an option.'
    }
    if (!form.business_type) errors.business_type = 'Please choose the type of business.'
    if (!form.terms_accepted) errors.terms_accepted = 'You must accept the Terms of Trade.'
    return errors
  }

  // Server 422 paths are `application.<field>` for form fields, bare for the
  // login pair; strip the prefix and keep only fields we render.
  const applyServerErrors = (serverErrors) => {
    const mapped = {}
    for (const item of serverErrors) {
      if (typeof item?.field !== 'string') continue
      const key = item.field.replace(/^application\./, '')
      if (key in INITIAL_FORM) mapped[key] = item.message
    }
    return mapped
  }

  const buildPayload = () => {
    const application = {}
    for (const key of APPLICATION_TEXT_KEYS) {
      const value = form[key].trim()
      if (value) application[key] = value
    }
    application.mailchimp_opt_in = form.mailchimp_opt_in === 'yes'
    application.cash_account_acceptable = form.cash_account_acceptable === 'yes'
    application.business_type = form.business_type
    application.wants_showroom_visit = form.wants_showroom_visit
    application.wants_account_manager = form.wants_account_manager
    application.terms_accepted = form.terms_accepted

    const payload = { email: form.email.trim(), password: form.password, application }
    if (form.name.trim()) payload.name = form.name.trim()
    return payload
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors)
      setError('Please complete the highlighted fields.')
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await apiFetch('/auth/trade-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      })
      setSubmitted(true)
    } catch (err) {
      const serverErrors = err instanceof ApiError ? err.body?.errors : null
      if (Array.isArray(serverErrors) && serverErrors.length > 0) {
        setFieldErrors(applyServerErrors(serverErrors))
      }
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // Plain render helpers (not components — see the ESLint note above).
  const textField = ({ key, label, type = 'text', autoComplete, optional, textarea, hint }) => (
    <label className="field" key={key}>
      <span>{label}</span>
      {textarea ? (
        <textarea
          rows={2}
          value={form[key]}
          onChange={(e) => update(key, e.target.value)}
        />
      ) : (
        <input
          type={type}
          autoComplete={autoComplete}
          value={form[key]}
          onChange={(e) => update(key, e.target.value)}
          required={!optional}
        />
      )}
      {hint && <span className="field-hint">{hint}</span>}
      {fieldErrors[key] && <span className="field-error">{fieldErrors[key]}</span>}
    </label>
  )

  const radioGroup = (key, label, options) => (
    <div className="field" role="radiogroup" aria-label={label}>
      <span>{label}</span>
      {options.map(([value, text]) => (
        <label className="field-checkbox" key={value}>
          <input
            type="radio"
            name={key}
            checked={form[key] === value}
            onChange={() => update(key, value)}
          />
          <span>{text}</span>
        </label>
      ))}
      {fieldErrors[key] && <span className="field-error">{fieldErrors[key]}</span>}
    </div>
  )

  const checkbox = (key, text) => (
    <label className="field-checkbox">
      <input
        type="checkbox"
        checked={form[key]}
        onChange={(e) => update(key, e.target.checked)}
      />
      <span>{text}</span>
    </label>
  )

  if (submitted) {
    return (
      <div className="auth-success">
        <h2>Application received</h2>
        <p>
          Your trade account has been created and you are now logged in. Trade
          pricing is approved <strong>manually</strong> — our team will review
          your application and be in touch. Until it is approved your account
          works as a standard customer account.
        </p>
        <a className="btn btn-primary" href="/products">
          Browse the catalogue
        </a>
      </div>
    )
  }

  return (
    <form className="auth-form trade-form" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <p className="auth-intro">
        Apply for a trade account to access trade pricing. Approval is manual —
        we review each application before enabling trade prices.
      </p>

      <fieldset className="field-group">
        <legend>Your login</legend>
        {textField({ key: 'name', label: 'Your name', autoComplete: 'name', optional: true })}
        {textField({ key: 'email', label: 'Email', type: 'email', autoComplete: 'email' })}
        {textField({
          key: 'password',
          label: 'Password',
          type: 'password',
          autoComplete: 'new-password',
          hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
        })}
      </fieldset>

      {TEXT_SECTIONS.map((section) => (
        <fieldset className="field-group" key={section.legend}>
          <legend>{section.legend}</legend>
          {section.fields.map((field) => textField(field))}
        </fieldset>
      ))}

      <fieldset className="field-group">
        <legend>Communication preferences</legend>
        {radioGroup(
          'mailchimp_opt_in',
          'Are you happy to receive notifications from Mailchimp?',
          YES_NO
        )}
        {textField({
          key: 'primary_contact_email',
          label: 'Primary contact email',
          type: 'email',
        })}
        <div className="field">
          <span>Would you like to:</span>
          {checkbox('wants_showroom_visit', 'Visit the showrooms')}
          {checkbox('wants_account_manager', 'Be contacted by an account manager')}
        </div>
      </fieldset>

      <fieldset className="field-group">
        <legend>Trading account details</legend>
        {textField({ key: 'nzbn', label: 'NZBN' })}
        {radioGroup('business_type', 'Type of business', BUSINESS_TYPES)}
        {textField({
          key: 'registered_office_address',
          label: 'Address of registered office',
          textarea: true,
        })}
        {textField({
          key: 'directors_names_addresses',
          label: 'Directors/proprietors — full names & residential addresses',
          textarea: true,
        })}
        {textField({
          key: 'directors_dates_of_birth',
          label: 'Directors/proprietors — dates of birth',
        })}
        {radioGroup('cash_account_acceptable', 'Cash account acceptable?', YES_NO)}
      </fieldset>

      <fieldset className="field-group">
        <legend>Trade references</legend>
        {textField({
          key: 'trade_reference',
          label: 'Name / contact person / phone',
          textarea: true,
        })}
      </fieldset>

      <fieldset className="field-group">
        <legend>Consent</legend>
        <div className="field">
          {checkbox('terms_accepted', 'I agree to the Terms of Trade.')}
          {fieldErrors.terms_accepted && (
            <span className="field-error">{fieldErrors.terms_accepted}</span>
          )}
        </div>
        {textField({
          key: 'customer_full_name',
          label: 'The customer (full business & contact name)',
        })}
        {textField({ key: 'signatory_name', label: 'Name of signatory' })}
        {textField({ key: 'signatory_position', label: 'Position/title' })}
        {textField({
          key: 'signature',
          label: 'Signature',
          hint: 'Type your full name as your signature.',
        })}
      </fieldset>

      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Apply for trade account'}
      </button>

      <p className="auth-alt">
        Not trade? <a href="/register">Create a standard account</a>.
      </p>
    </form>
  )
}
