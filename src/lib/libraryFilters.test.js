import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptySelection,
  readSelection,
  selectionParams,
  selectedCount,
  toggleValue,
} from './libraryFilters.js'

const KEYS = ['brand', 'composition']

test('readSelection: repeated keys, dedupe, blanks dropped, absent key empty', () => {
  const params = new URLSearchParams('brand=dedar&brand=zimmer&brand=dedar&brand=%20&x=1')
  const selection = readSelection(params, KEYS)
  assert.deepEqual(selection, { brand: ['dedar', 'zimmer'], composition: [] })
  assert.ok(Object.isFrozen(selection))
  assert.ok(Object.isFrozen(selection.brand))
})

test('a single-value deep link is the one-element case', () => {
  assert.deepEqual(readSelection(new URLSearchParams('brand=dedar'), KEYS).brand, ['dedar'])
})

test('selectionParams round-trips a value with a comma in it', () => {
  const selection = { brand: ['dedar'], composition: ['55% linen, 45% cotton'] }
  const params = selectionParams(selection)
  assert.equal(params.toString(), 'brand=dedar&composition=55%25+linen%2C+45%25+cotton')
  assert.deepEqual(readSelection(params, KEYS), selection)
})

test('toggleValue adds, removes, and never mutates', () => {
  const start = Object.freeze(['a'])
  assert.deepEqual(toggleValue(start, 'b'), ['a', 'b'])
  assert.deepEqual(toggleValue(start, 'a'), [])
  assert.deepEqual(start, ['a'])
})

test('emptySelection and selectedCount', () => {
  const empty = emptySelection(KEYS)
  assert.deepEqual(empty, { brand: [], composition: [] })
  assert.equal(selectedCount(empty), 0)
  assert.equal(selectedCount({ brand: ['a', 'b'], composition: ['c'] }), 3)
})
