// The trade client's own application, editable from the portal (16 Sep 2026).
// The sections mirror the paper form and the CRM's ApplicationDetail; the
// consent block (terms, signatory, signature) is deliberately absent — it is
// the record of what was agreed, and the API refuses it anyway.

export const BUSINESS_TYPES = Object.freeze([
  { value: 'limited_liability_company', label: 'Limited Liability Company' },
  { value: 'sole_trader', label: 'Sole Trader' },
  { value: 'partnership', label: 'Partnership' },
])

// kind: 'text' | 'email' | 'tel' | 'textarea' | 'bool' | 'business_type'
export const TRADE_DETAIL_SECTIONS = Object.freeze([
  {
    title: 'Business',
    fields: [
      { key: 'business_name', label: 'Business name', kind: 'text' },
      { key: 'registered_name', label: 'Registered name (if different)', kind: 'text' },
      { key: 'postal_address', label: 'Postal address', kind: 'textarea', wide: true },
      { key: 'delivery_address', label: 'Delivery address', kind: 'textarea', wide: true },
      { key: 'landline_phone', label: 'Landline phone', kind: 'tel' },
      { key: 'mobile_phone', label: 'Mobile phone', kind: 'tel' },
    ],
  },
  {
    title: 'Accounts contact',
    fields: [
      { key: 'accounts_contact_name', label: 'Contact name', kind: 'text' },
      { key: 'accounts_contact_person', label: 'Contact person', kind: 'text' },
      { key: 'accounts_email', label: 'Accounts email', kind: 'email' },
    ],
  },
  {
    title: 'Design contact',
    fields: [
      { key: 'design_contact_name', label: 'Contact name', kind: 'text' },
      { key: 'design_contact_email', label: 'Email', kind: 'email' },
      { key: 'design_contact_phone', label: 'Phone', kind: 'tel' },
      { key: 'design_qualifications', label: 'Design qualifications', kind: 'text' },
    ],
  },
  {
    title: 'Communication',
    fields: [
      { key: 'primary_contact_email', label: 'Primary contact email', kind: 'email' },
      { key: 'mailchimp_opt_in', label: 'Send me Atelier news by email', kind: 'bool', wide: true },
      { key: 'wants_showroom_visit', label: 'I would like to visit the showrooms', kind: 'bool', wide: true },
      { key: 'wants_account_manager', label: 'I would like an account manager to call', kind: 'bool', wide: true },
    ],
  },
  {
    title: 'Trading account',
    fields: [
      { key: 'nzbn', label: 'NZBN', kind: 'text' },
      { key: 'business_type', label: 'Type of business', kind: 'business_type' },
      { key: 'registered_office_address', label: 'Registered office address', kind: 'textarea', wide: true },
      { key: 'directors_names_addresses', label: 'Directors / proprietors — names and addresses', kind: 'textarea', wide: true },
      { key: 'directors_dates_of_birth', label: 'Directors / proprietors — dates of birth', kind: 'text' },
      { key: 'cash_account_acceptable', label: 'A cash account is acceptable', kind: 'bool', wide: true },
      { key: 'trade_reference', label: 'Trade reference (name / contact / phone)', kind: 'textarea', wide: true },
    ],
  },
])

export const TRADE_DETAIL_FIELDS = Object.freeze(
  TRADE_DETAIL_SECTIONS.flatMap((section) => section.fields)
)

/**
 * The PATCH body from the form: every declared field, text trimmed, booleans
 * read off their checkbox ("on" or absent). A blank text field goes up as ''
 * so the API's validator can name it, rather than being dropped and silently
 * keeping the old value.
 *
 * @param {{ get: (name: string) => any }} form  a FormData
 * @returns {object}
 */
export function tradeDetailsPatch(form) {
  return Object.fromEntries(
    TRADE_DETAIL_FIELDS.map((field) =>
      field.kind === 'bool'
        ? [field.key, form.get(field.key) === 'on']
        : [field.key, String(form.get(field.key) ?? '').trim()]
    )
  )
}

/**
 * The API's 422 errors ({ field: 'application.nzbn', message }) keyed by the
 * form's own field name, for printing under the box.
 *
 * @param {Array<{field?: string, message?: string}>} errors
 * @returns {Record<string, string>}
 */
export function tradeDetailsErrors(errors = []) {
  return Object.fromEntries(
    errors
      .filter((error) => typeof error?.field === 'string')
      .map((error) => [error.field.replace(/^application\./, ''), error.message ?? 'Check this field.'])
  )
}
