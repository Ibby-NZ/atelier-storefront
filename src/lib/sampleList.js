// The sample enquiry cart (16 Sep 2026). "Request a sample" on a product page
// used to be a link to /contact with the colourway named; a shopper wanting
// three cuttings wrote three enquiries. Now it adds the colourway HERE — a
// localStorage list, the requestList.js shape — and /sample-request sends the
// whole list as one POST /samples/request, which lands in the CRM's sample
// requests queue as "pending" and emails both sides.
//
// Pure transforms first (tested), the storage layer under them. One line per
// SKU: asking for the same cutting twice is one cutting.

export const SAMPLE_STORAGE_KEY = 'atelier_sample_list'
export const SAMPLE_EVENT = 'atelier-sample-change'
export const SAMPLE_PATH = '/sample-request'
export const MAX_SAMPLE_LINES = 20

function lineIdentity(item) {
  return {
    sku: String(item.sku),
    slug: item.slug ?? null,
    name: item.name ?? null,
    brand: item.brand ?? null,
    colourway: item.colourway ?? null,
    image_url: item.image_url ?? null,
  }
}

export function mergeSampleLine(items, item) {
  if (!item || !item.sku) return items
  const identity = lineIdentity(item)
  if (items.some((line) => line.sku === identity.sku)) {
    return items.map((line) => (line.sku === identity.sku ? { ...line, ...identity } : line))
  }
  if (items.length >= MAX_SAMPLE_LINES) return items
  return [...items, { ...identity, note: null }]
}

export function withSampleNote(items, sku, note) {
  const text = String(note ?? '')
  return items.map((line) => (line.sku === sku ? { ...line, note: text === '' ? null : text } : line))
}

export function withoutSampleLine(items, sku) {
  return items.filter((line) => line.sku !== sku)
}

export function sampleLineCount(items) {
  return items.length
}

export function isSampleListed(items, sku) {
  return items.some((line) => line.sku === sku)
}

export function toSamplePayloadLines(items) {
  return items.map((line) => ({
    sku: line.sku,
    note: String(line.note ?? '').trim() || null,
  }))
}

/* --- Storage layer --------------------------------------------------------- */

const hasWindow = () => typeof window !== 'undefined'

export function readSampleList() {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(SAMPLE_STORAGE_KEY)
    if (!raw) return []
    const items = JSON.parse(raw)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

function writeSampleList(items) {
  if (!hasWindow()) return items
  try {
    window.localStorage.setItem(SAMPLE_STORAGE_KEY, JSON.stringify(items))
    window.dispatchEvent(new Event(SAMPLE_EVENT))
  } catch {
    // Storage unavailable (private mode / quota) — ignore silently.
  }
  return items
}

export function addToSampleList(item) {
  return writeSampleList(mergeSampleLine(readSampleList(), item))
}

export function setSampleNote(sku, note) {
  return writeSampleList(withSampleNote(readSampleList(), sku, note))
}

export function removeFromSampleList(sku) {
  return writeSampleList(withoutSampleLine(readSampleList(), sku))
}

export function clearSampleList() {
  return writeSampleList([])
}

export function sampleListCount() {
  return sampleLineCount(readSampleList())
}
