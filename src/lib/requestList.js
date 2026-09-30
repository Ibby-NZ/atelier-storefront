// Client-side fabric REQUEST LIST — the cart's sibling for cut-to-order cloth.
//
// The cart (src/lib/cart.js) holds finished goods: whole units, a known retail
// price, and a Stripe checkout at the end of it. Fabric can do none of that. It
// is measured in metres (decimal), carries per-line cut requirements, is priced
// by the back office after they verify stock and batch shading, and ends in
// `POST /orders/request` — not a payment. So it gets its own list under its own
// storage key rather than being squeezed into the cart, where a metre would have
// to pretend to be a unit and a priceless line would have to pretend to cost 0.
//
// Everything else deliberately mirrors cart.js so the two read alike: an array
// in localStorage, merge-by-SKU on add, immutable updates, and a same-tab change
// event (the native `storage` event only fires in OTHER tabs, so the header
// indicator would never see a change made in the tab it lives in).
//
// Stored line shape — the identity fields use the cart's vocabulary so the same
// markup and CSS render both:
//   { sku, slug, name, brand, colourway, image_url, in_stock, lead_time,
//     metres, cut_requirements, unavailable? }
//
// The list transforms are exported as pure functions over an array and tested
// directly (src/lib/requestList.test.js); the wrappers below are the thin
// storage layer around them.

export const REQUEST_STORAGE_KEY = 'atelier_request_list'
export const REQUEST_EVENT = 'atelier-request-change'

// A single cut nobody is going to place through a web form. Guards a typo
// (2000 instead of 20) from reserving the whole roll in the API's inventory.
export const MAX_METRES = 999
export const METRES_STEP = 0.1

/* --- Pure list transforms -------------------------------------------------- */

// Metres are decimal, unlike a cart quantity. Rounded to 2dp because 0.1 + 0.2
// is 0.30000000000000004 and that would be posted to the API verbatim, and
// clamped to MAX_METRES. Returns 0 for anything unusable — callers decide
// whether 0 means "reject" or "fall back to 1".
export function normaliseMetres(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.min(Math.round(amount * 100) / 100, MAX_METRES)
}

// A line's unit (1 Oct 2026). Every product can be quoted now, not only fabric,
// so a finished good lands here in whole UNITS while a cloth stays in metres.
// A line stored before this has no unit and is metres. The amount keeps the
// `metres` key either way — it is what the API's `qty_metres` carries, and the
// API reads the unit off the product, never off the request.
export const LINE_UNITS = Object.freeze({ metre: 'metre', unit: 'unit' })
export const lineUnit = (line) => (line?.unit === LINE_UNITS.unit ? LINE_UNITS.unit : LINE_UNITS.metre)

// A line's amount in its own unit: metres to 2dp, units to a whole number.
// 0 for anything unusable, as normaliseMetres.
export function normaliseAmount(value, unit = LINE_UNITS.metre) {
  if (unit !== LINE_UNITS.unit) return normaliseMetres(value)
  const amount = Math.round(Number(value))
  return Number.isFinite(amount) && amount >= 1 ? Math.min(amount, MAX_METRES) : 0
}

// The part of a line that describes the cloth, as opposed to what the shopper
// asked for. Kept separate so a re-add (or a live refresh) can update the name,
// image and stock state without touching the metres or the cut requirements
// already typed against that SKU.
function lineIdentity(item) {
  return {
    sku: String(item.sku),
    slug: item.slug ?? null,
    name: item.name ?? null,
    brand: item.brand ?? null,
    colourway: item.colourway ?? null,
    image_url: item.image_url ?? null,
    // Absent means "we do not know it is in stock", which reads as made to
    // order. That is the safe direction: it shows the lead-time checkbox, where
    // the opposite mistake is a 422 from the API at submit.
    in_stock: item.in_stock === true,
    lead_time: item.lead_time ?? null,
    unit: lineUnit(item),
  }
}

// Adds `metres` of a colourway, merging by SKU so a repeat add bumps the metres
// instead of duplicating the row (cart.js `addToCart` semantics). An unusable
// metres value falls back to 1 rather than dropping the add on the floor.
export function mergeRequestLine(items, item, metres = 1) {
  if (!item || !item.sku) return items
  const identity = lineIdentity(item)
  const amount = normaliseAmount(metres, identity.unit) || 1
  const existing = items.find((line) => line.sku === identity.sku)
  if (!existing) {
    return [...items, { ...identity, metres: amount, cut_requirements: null }]
  }
  return items.map((line) =>
    line.sku === identity.sku
      ? {
          ...line,
          ...identity,
          metres: normaliseAmount(Number(line.metres) + amount, identity.unit) || amount,
          // The shopper's own inputs survive the merge.
          cut_requirements: line.cut_requirements ?? null,
        }
      : line
  )
}

// Sets the absolute metres of a line. Unlike the cart's `setCartQty`, a zero or
// unusable value does NOT remove the line — it leaves the list alone. Removal is
// the explicit Remove button. Editing an inline metres field means passing
// through '' and '0.' on the way to '0.5', and treating those as a delete makes
// a line vanish mid-keystroke.
export function withRequestMetres(items, sku, metres) {
  return items.map((line) => {
    if (line.sku !== sku) return line
    const amount = normaliseAmount(metres, lineUnit(line))
    return amount === 0 ? line : { ...line, metres: amount }
  })
}

// Per-line cut requirements (batch shading, cutting instructions). Stored
// VERBATIM, trimmed only on the way out (toRequestPayloadLines). Trimming here
// looks harmless and is not: the textarea is controlled from this list, so
// typing "Cut " would store "Cut", re-render the field without the space, and
// the next character would land as "Cuti". Only an empty field clears to null,
// so the API is never sent an empty string.
export function withRequestNote(items, sku, note) {
  const text = String(note ?? '')
  return items.map((line) =>
    line.sku === sku ? { ...line, cut_requirements: text === '' ? null : text } : line
  )
}

export function withoutRequestLine(items, sku) {
  return items.filter((line) => line.sku !== sku)
}

// Fold a fresh `GET /catalogue/products/:slug` back over the stored lines, so a
// list built last week does not submit last week's stock state (which decides
// whether the lead-time checkbox is required) or a renamed colourway.
//
// `bySlug` is a Map of product slug -> product, where an explicit `null` value
// means the API confirmed the product is gone (404). A slug MISSING from the map
// is a fetch that failed for some other reason and must leave its lines exactly
// as they were — an unreachable API is not evidence that a product was deleted.
export function applyProductRefresh(items, bySlug) {
  return items.map((line) => {
    if (!bySlug.has(line.slug)) return line
    const product = bySlug.get(line.slug)
    if (!product) return { ...line, unavailable: true }
    const colourway = (product.colourways ?? []).find((entry) => entry.sku === line.sku)
    // The product is still listed but this colourway is not — the SKU would 422
    // at submit, so flag it here where it can be removed.
    if (!colourway) return { ...line, unavailable: true }
    return {
      ...line,
      unavailable: false,
      name: product.name ?? line.name,
      brand: product.brand?.name ?? line.brand,
      colourway: colourway.name ?? line.colourway,
      image_url: colourway.image_url ?? product.hi_res_asset_url ?? line.image_url,
      in_stock: colourway.in_stock === true,
      lead_time: product.lead_time ?? line.lead_time,
    }
  })
}

// Lines, not metres: a request list of "3" means three cloths, and totalling
// decimals into a header badge would read as a price.
export function requestLineCount(items) {
  return items.length
}

// Metres of cloth only; a finished good's units are counted apart.
export function requestTotalMetres(items) {
  return normaliseMetres(
    items
      .filter((line) => lineUnit(line) === LINE_UNITS.metre)
      .reduce((sum, line) => sum + (Number(line.metres) || 0), 0)
  )
}

export function requestTotalUnits(items) {
  return items
    .filter((line) => lineUnit(line) === LINE_UNITS.unit)
    .reduce((sum, line) => sum + (normaliseAmount(line.metres, LINE_UNITS.unit) || 0), 0)
}

// Any line short on stock makes the whole request a backorder API-side, which
// requires an explicit accepted_lead_time (else 422).
export function hasBackorderLine(items) {
  return items.some((line) => line.in_stock !== true)
}

export function hasUnavailableLine(items) {
  return items.some((line) => line.unavailable === true)
}

// The exact `lines` array `POST /orders/request` expects. This is where a note
// is trimmed — see withRequestNote for why it is not trimmed on the way in.
export function toRequestPayloadLines(items) {
  return items.map((line) => ({
    sku: line.sku,
    qty_metres: normaliseAmount(line.metres, lineUnit(line)),
    cut_requirements: String(line.cut_requirements ?? '').trim() || null,
  }))
}

/* --- Storage layer --------------------------------------------------------- */

// SSR renders islands once before hydration; guard every localStorage access.
const hasWindow = () => typeof window !== 'undefined'

export function readRequestList() {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(REQUEST_STORAGE_KEY)
    if (!raw) return []
    const items = JSON.parse(raw)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

// Persist and notify same-tab listeners. Never throws — a full or unavailable
// localStorage must not break the page.
function writeRequestList(items) {
  if (!hasWindow()) return items
  try {
    window.localStorage.setItem(REQUEST_STORAGE_KEY, JSON.stringify(items))
    window.dispatchEvent(new Event(REQUEST_EVENT))
  } catch {
    // Storage unavailable (private mode / quota) — ignore silently.
  }
  return items
}

export function addToRequestList(item, metres = 1) {
  return writeRequestList(mergeRequestLine(readRequestList(), item, metres))
}

export function setRequestMetres(sku, metres) {
  return writeRequestList(withRequestMetres(readRequestList(), sku, metres))
}

export function setRequestNote(sku, note) {
  return writeRequestList(withRequestNote(readRequestList(), sku, note))
}

export function removeFromRequestList(sku) {
  return writeRequestList(withoutRequestLine(readRequestList(), sku))
}

export function replaceRequestList(items) {
  return writeRequestList(Array.isArray(items) ? items : [])
}

// Emptied after a submitted request — the order now lives server-side.
export function clearRequestList() {
  return writeRequestList([])
}

export function requestListCount() {
  return requestLineCount(readRequestList())
}

// ---- Delivery address on a request (Userback 8373461) ----------------------
//
// The same shape the Stripe webhook writes for a card checkout, so the CRM's
// Delivery block and the packing slip read a request and a checkout alike.
// `state` is not asked for — NZ addresses have none — and is sent null.

export const ADDRESS_FIELDS = Object.freeze([
  { key: 'line1', label: 'Street address', autoComplete: 'address-line1' },
  { key: 'line2', label: 'Apartment, suite, etc.', autoComplete: 'address-line2' },
  { key: 'city', label: 'City', autoComplete: 'address-level2' },
  { key: 'postal_code', label: 'Postcode', autoComplete: 'postal-code' },
  { key: 'country', label: 'Country', autoComplete: 'country-name' },
])

export const EMPTY_ADDRESS = Object.freeze({
  line1: '',
  line2: '',
  city: '',
  postal_code: '',
  country: 'New Zealand',
})

const trimmedOrNull = (value) => {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

/**
 * The `shipping_address` body for POST /orders/request, or undefined when the
 * form names nowhere — a country alone (the prefilled default) is not an
 * address, and sending one would make every collected order look shipped.
 *
 * @param {object} address  the form's address state
 * @param {string} [name]   the contact name, carried as the addressee
 * @returns {object|undefined}
 */
export function requestAddressPayload(address = {}, name = '') {
  const line1 = trimmedOrNull(address.line1)
  const city = trimmedOrNull(address.city)
  if (!line1 && !city) return undefined
  return {
    name: trimmedOrNull(name),
    line1,
    line2: trimmedOrNull(address.line2),
    city,
    state: null,
    postal_code: trimmedOrNull(address.postal_code),
    country: trimmedOrNull(address.country),
  }
}
