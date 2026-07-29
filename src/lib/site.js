// Single source of truth for Atelier Textiles contact details, showrooms and
// social links, imported from the live atelier.co.nz. Footer, contact page and
// the contact form all read from here so the details can never drift apart —
// update this file, not three components.

export const CONTACT = Object.freeze({
  // Public enquiries inbox. The contact form posts to the API (which emails the
  // back office); this address is shown for people who prefer to email directly.
  email: 'enquiries@atelier.co.nz',
  phone: '+64 9 373 3866',
  // Digits only, for the tel: link.
  phoneHref: '+6493733866',
  freephone: '0800 ATELIER',
})

// Trade showrooms are open Monday–Friday, 9am–4:30pm (by appointment).
export const SHOWROOM_HOURS = 'Monday–Friday, 9am–4:30pm'

export const SHOWROOMS = Object.freeze([
  Object.freeze({
    city: 'Auckland',
    name: 'Atelier Textiles',
    lines: ['16 York Street', 'Parnell, Auckland 1052'],
  }),
  Object.freeze({
    city: 'Wellington',
    name: 'Wellington Design Library',
    lines: ['282 Thorndon Quay', 'Pipitea, Wellington 6011'],
  }),
  Object.freeze({
    city: 'Christchurch',
    name: 'Mainland Design Centre',
    lines: ['323 Madras Street', 'Christchurch Central'],
  }),
])

export const SOCIAL = Object.freeze([
  Object.freeze({ label: 'Instagram', href: 'https://www.instagram.com/atelier_textiles' }),
  Object.freeze({ label: 'Facebook', href: 'https://www.facebook.com/AtelierTextiles' }),
])
