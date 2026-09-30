import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_METRES,
  normaliseMetres,
  mergeRequestLine,
  withRequestMetres,
  withRequestNote,
  withoutRequestLine,
  applyProductRefresh,
  requestLineCount,
  requestTotalMetres,
  requestTotalUnits,
  lineUnit,
  hasBackorderLine,
  hasUnavailableLine,
  toRequestPayloadLines,
  EMPTY_ADDRESS,
  requestAddressPayload,
} from './requestList.js'

// The list transforms are pure, so they test without a DOM. The storage
// wrappers around them are two lines each over window.localStorage.

const swatch = (extra = {}) => ({
  sku: 'PF-ATLAS-01',
  slug: 'pierre-frey-atlas',
  name: 'Atlas',
  brand: 'Pierre Frey',
  colourway: 'Bleu',
  image_url: 'https://cdn.example/atlas-bleu.jpg',
  in_stock: true,
  lead_time: '6 weeks',
  ...extra,
})

test('metres round to 2dp, clamp to the maximum, and reject the unusable', () => {
  assert.equal(normaliseMetres('3.5'), 3.5)
  // 0.1 + 0.2 is 0.30000000000000004; unrounded it would be posted verbatim.
  assert.equal(normaliseMetres(0.1 + 0.2), 0.3)
  assert.equal(normaliseMetres(3.456), 3.46)
  assert.equal(normaliseMetres(2.344), 2.34)
  assert.equal(normaliseMetres(MAX_METRES + 500), MAX_METRES)
  for (const bad of ['', ' ', 'six', null, undefined, NaN, 0, -4, Infinity]) {
    assert.equal(normaliseMetres(bad), 0, `expected 0 for ${String(bad)}`)
  }
})

test('adding builds a line and never mutates the array it was given', () => {
  const items = []
  const next = mergeRequestLine(items, swatch(), 4.5)
  assert.equal(items.length, 0)
  assert.deepEqual(next, [
    {
      sku: 'PF-ATLAS-01',
      slug: 'pierre-frey-atlas',
      name: 'Atlas',
      brand: 'Pierre Frey',
      colourway: 'Bleu',
      image_url: 'https://cdn.example/atlas-bleu.jpg',
      in_stock: true,
      lead_time: '6 weeks',
      unit: 'metre',
      metres: 4.5,
      cut_requirements: null,
    },
  ])
})

test('a repeat add sums metres on the same SKU rather than duplicating the row', () => {
  const once = mergeRequestLine([], swatch(), 2)
  const twice = mergeRequestLine(once, swatch(), 1.25)
  assert.equal(twice.length, 1)
  assert.equal(twice[0].metres, 3.25)
})

test('a repeat add refreshes the cloth but keeps the cut requirements typed against it', () => {
  const withNote = withRequestNote(mergeRequestLine([], swatch(), 2), 'PF-ATLAS-01', 'Cut in one length')
  const next = mergeRequestLine(withNote, swatch({ in_stock: false, colourway: 'Bleu Nuit' }), 1)
  assert.equal(next[0].cut_requirements, 'Cut in one length')
  assert.equal(next[0].colourway, 'Bleu Nuit')
  assert.equal(next[0].in_stock, false)
})

test('an unusable metres value on add falls back to 1 instead of dropping the add', () => {
  assert.equal(mergeRequestLine([], swatch(), '')[0].metres, 1)
  assert.equal(mergeRequestLine([], swatch(), -3)[0].metres, 1)
})

test('an item with no SKU is refused', () => {
  const items = [{ sku: 'A', metres: 1 }]
  assert.equal(mergeRequestLine(items, { name: 'No SKU' }, 2), items)
  assert.equal(mergeRequestLine(items, null, 2), items)
})

test('unknown stock state reads as made-to-order, not as in stock', () => {
  const line = mergeRequestLine([], { sku: 'X-1' }, 1)[0]
  assert.equal(line.in_stock, false)
  assert.equal(hasBackorderLine([line]), true)
})

test('editing metres to a blank or zero leaves the line alone — only Remove removes', () => {
  const items = mergeRequestLine([], swatch(), 5)
  // '' and '0.' are keystrokes on the way to '0.5'; a line must not vanish
  // under the shopper's cursor.
  assert.equal(withRequestMetres(items, 'PF-ATLAS-01', '')[0].metres, 5)
  assert.equal(withRequestMetres(items, 'PF-ATLAS-01', '0.')[0].metres, 5)
  assert.equal(withRequestMetres(items, 'PF-ATLAS-01', 0)[0].metres, 5)
  assert.equal(withRequestMetres(items, 'PF-ATLAS-01', '7.25')[0].metres, 7.25)
  assert.equal(withoutRequestLine(items, 'PF-ATLAS-01').length, 0)
})

test('a cut requirement is stored verbatim — trimming it on the way in eats the space you just typed', () => {
  const items = mergeRequestLine([], swatch(), 2)
  // The textarea is controlled from this list. Store "Cut" for "Cut " and the
  // field re-renders without the space, so the next character lands as "Cuti".
  assert.equal(withRequestNote(items, 'PF-ATLAS-01', 'Cut ')[0].cut_requirements, 'Cut ')
  assert.equal(withRequestNote(items, 'PF-ATLAS-01', ' Match batch 44')[0].cut_requirements, ' Match batch 44')
})

test('an empty cut requirement clears back to null, never an empty string', () => {
  const items = mergeRequestLine([], swatch(), 2)
  assert.equal(withRequestNote(items, 'PF-ATLAS-01', '')[0].cut_requirements, null)
  assert.equal(withRequestNote(items, 'PF-ATLAS-01', undefined)[0].cut_requirements, null)
})

test('the payload is where a note is trimmed, and whitespace-only becomes null', () => {
  const items = withRequestNote(mergeRequestLine([], swatch(), 2), 'PF-ATLAS-01', '  Cut in one length  ')
  assert.equal(toRequestPayloadLines(items)[0].cut_requirements, 'Cut in one length')
  assert.equal(toRequestPayloadLines(withRequestNote(items, 'PF-ATLAS-01', '   '))[0].cut_requirements, null)
})

test('a refresh updates stock, name and image from the live product', () => {
  const items = mergeRequestLine([], swatch({ in_stock: true }), 3)
  const bySlug = new Map([
    [
      'pierre-frey-atlas',
      {
        name: 'Atlas Grand',
        brand: { name: 'Pierre Frey' },
        lead_time: '8 weeks',
        colourways: [
          { sku: 'PF-ATLAS-01', name: 'Bleu Nuit', image_url: 'https://cdn.example/new.jpg', in_stock: false },
        ],
      },
    ],
  ])
  const [line] = applyProductRefresh(items, bySlug)
  assert.equal(line.in_stock, false)
  assert.equal(line.name, 'Atlas Grand')
  assert.equal(line.colourway, 'Bleu Nuit')
  assert.equal(line.image_url, 'https://cdn.example/new.jpg')
  assert.equal(line.lead_time, '8 weeks')
  assert.equal(line.unavailable, false)
  // The shopper's own inputs are not part of a refresh.
  assert.equal(line.metres, 3)
})

test('a refresh flags a SKU the live product no longer lists', () => {
  const items = mergeRequestLine([], swatch(), 3)
  const bySlug = new Map([['pierre-frey-atlas', { name: 'Atlas', colourways: [{ sku: 'OTHER', in_stock: true }] }]])
  const [line] = applyProductRefresh(items, bySlug)
  assert.equal(line.unavailable, true)
  assert.equal(hasUnavailableLine([line]), true)
})

test('a refresh flags a product the API confirms is gone', () => {
  const items = mergeRequestLine([], swatch(), 3)
  const [line] = applyProductRefresh(items, new Map([['pierre-frey-atlas', null]]))
  assert.equal(line.unavailable, true)
})

test('a slug missing from the refresh is left untouched — a dead API deletes nothing', () => {
  const items = mergeRequestLine([], swatch(), 3)
  const [line] = applyProductRefresh(items, new Map())
  assert.deepEqual(line, items[0])
  assert.equal(line.unavailable, undefined)
})

test('counts are lines, totals are metres', () => {
  const items = mergeRequestLine(mergeRequestLine([], swatch(), 2.5), swatch({ sku: 'B-2', slug: 'b' }), 4.25)
  assert.equal(requestLineCount(items), 2)
  assert.equal(requestTotalMetres(items), 6.75)
  assert.equal(requestTotalMetres([]), 0)
})

test('the payload carries only what POST /orders/request accepts', () => {
  const items = withRequestNote(
    mergeRequestLine(mergeRequestLine([], swatch(), 2), swatch({ sku: 'B-2', slug: 'b' }), 4),
    'B-2',
    'Cut in one length'
  )
  assert.deepEqual(toRequestPayloadLines(items), [
    { sku: 'PF-ATLAS-01', qty_metres: 2, cut_requirements: null },
    { sku: 'B-2', qty_metres: 4, cut_requirements: 'Cut in one length' },
  ])
})

test('one short line makes the whole request a backorder', () => {
  const items = mergeRequestLine(mergeRequestLine([], swatch(), 2), swatch({ sku: 'B-2', slug: 'b', in_stock: false }), 1)
  assert.equal(hasBackorderLine(items), true)
  assert.equal(hasBackorderLine([items[0]]), false)
  assert.equal(hasBackorderLine([]), false)
})

test('requestAddressPayload sends nothing when the form names nowhere — a default country alone is not an address', () => {
  assert.equal(requestAddressPayload(EMPTY_ADDRESS, 'Ada'), undefined)
  assert.equal(requestAddressPayload({ ...EMPTY_ADDRESS, postal_code: '1010' }, 'Ada'), undefined)
})

test('requestAddressPayload sends the checkout shape, trimmed, blanks as null, with the contact as addressee', () => {
  assert.deepEqual(
    requestAddressPayload({ ...EMPTY_ADDRESS, line1: ' 12 Analytical Lane ', city: 'Auckland' }, ' Ada '),
    {
      name: 'Ada',
      line1: '12 Analytical Lane',
      line2: null,
      city: 'Auckland',
      state: null,
      postal_code: null,
      country: 'New Zealand',
    }
  )
})

// 1 Oct 2026: every listed product can be quoted, so a finished good lands on
// the request list in whole units beside cloth in metres.
test('a finished good is quoted in whole units, cloth in metres, and they total apart', () => {
  const cushion = { ...swatch(), sku: 'AT-CUSH-01', slug: 'atelier-cushion', name: 'Cushion', unit: 'unit' }
  let items = mergeRequestLine([], swatch(), 2.5)
  items = mergeRequestLine(items, cushion, 2.6)
  assert.equal(lineUnit(items[0]), 'metre')
  assert.equal(items[1].unit, 'unit')
  assert.equal(items[1].metres, 3)
  items = mergeRequestLine(items, cushion, 1)
  assert.equal(items[1].metres, 4)
  // A typed 1.5 on a unit line rounds; 0.4 is no quantity and leaves it alone.
  assert.equal(withRequestMetres(items, 'AT-CUSH-01', 1.5)[1].metres, 2)
  assert.equal(withRequestMetres(items, 'AT-CUSH-01', 0.4)[1].metres, 4)
  assert.equal(requestTotalMetres(items), 2.5)
  assert.equal(requestTotalUnits(items), 4)
  assert.deepEqual(toRequestPayloadLines(items).map((line) => line.qty_metres), [2.5, 4])
  // A line stored before units existed is metres.
  assert.equal(lineUnit({ sku: 'OLD', metres: 1.2 }), 'metre')
})
