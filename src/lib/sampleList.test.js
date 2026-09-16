import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_SAMPLE_LINES,
  isSampleListed,
  mergeSampleLine,
  sampleLineCount,
  toSamplePayloadLines,
  withSampleNote,
  withoutSampleLine,
} from './sampleList.js'

const atlas = { sku: 'PF-ATL-02', slug: 'atlas', name: 'Atlas', brand: 'Pierre Frey', colourway: 'Flax', image_url: null }

test('a colourway is listed once, and re-adding refreshes its identity', () => {
  const once = mergeSampleLine([], atlas)
  assert.equal(sampleLineCount(once), 1)
  assert.equal(once[0].note, null)
  const twice = mergeSampleLine(once, { ...atlas, image_url: 'x.jpg' })
  assert.equal(twice.length, 1)
  assert.equal(twice[0].image_url, 'x.jpg')
  assert.equal(isSampleListed(twice, 'PF-ATL-02'), true)
  assert.equal(isSampleListed(twice, 'nope'), false)
})

test('an item with no sku is ignored, and the list is capped', () => {
  assert.deepEqual(mergeSampleLine([], { name: 'no sku' }), [])
  let items = []
  for (let i = 0; i < MAX_SAMPLE_LINES + 3; i += 1) items = mergeSampleLine(items, { sku: `S-${i}` })
  assert.equal(items.length, MAX_SAMPLE_LINES)
})

test('notes are per line, blank clears, and the payload trims them', () => {
  const items = withSampleNote(mergeSampleLine([], atlas), 'PF-ATL-02', '  for a sofa ')
  assert.equal(items[0].note, '  for a sofa ')
  assert.deepEqual(toSamplePayloadLines(items), [{ sku: 'PF-ATL-02', note: 'for a sofa' }])
  assert.equal(withSampleNote(items, 'PF-ATL-02', '')[0].note, null)
  assert.deepEqual(withoutSampleLine(items, 'PF-ATL-02'), [])
})
