// The checkout page's customer form, as pure functions so the shape the API
// accepts (POST /checkout/session `customer`) is stated once and tested with
// no DOM. The island owns the state; this owns what a blank form is, how a
// prefill (GET /checkout/prefill) lands in it, and what is sent.

export const EMPTY_CUSTOMER = Object.freeze({
  name: '',
  email: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  postal_code: '',
})

/** A prefill from the API laid over the blank form; absent fields stay blank. */
export const customerFromPrefill = (prefill) => ({
  ...EMPTY_CUSTOMER,
  name: prefill?.name ?? '',
  email: prefill?.email ?? '',
  phone: prefill?.phone ?? '',
  line1: prefill?.address?.line1 ?? '',
  line2: prefill?.address?.line2 ?? '',
  city: prefill?.address?.city ?? '',
  postal_code: prefill?.address?.postal_code ?? '',
})

/** The form as the API's `customer` body: trimmed, line2 omitted when blank. */
export const customerBody = (form) => {
  const t = (key) => String(form[key] ?? '').trim()
  const line2 = t('line2')
  return {
    name: t('name'),
    email: t('email').toLowerCase(),
    phone: t('phone'),
    address: {
      line1: t('line1'),
      ...(line2 ? { line2 } : {}),
      city: t('city'),
      postal_code: t('postal_code'),
    },
  }
}
