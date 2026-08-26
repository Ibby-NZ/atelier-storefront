import test from 'node:test'
import assert from 'node:assert/strict'
import { markdownToPortableText } from './markdownToPortableText.js'

test('plain paragraphs become one block each, hard wraps joined', () => {
  const blocks = markdownToPortableText(
    'First paragraph\nwrapped onto a second line.\n\nSecond paragraph.\n'
  )
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0]._type, 'block')
  assert.equal(blocks[0].children[0].text, 'First paragraph wrapped onto a second line.')
  assert.equal(blocks[1].children[0].text, 'Second paragraph.')
  // Keys unique within the document — Portable Text renderers require it.
  const keys = blocks.map((block) => block._key)
  assert.equal(new Set(keys).size, keys.length)
})

test('empty and whitespace-only bodies convert to null', () => {
  assert.equal(markdownToPortableText(''), null)
  assert.equal(markdownToPortableText('   \n \n '), null)
  assert.equal(markdownToPortableText(undefined), null)
})

test('unsupported syntax refuses rather than degrades', () => {
  // Each of these would lose meaning if flattened to plain text, so the
  // converter must decline and leave the markdown as the source of record.
  const samples = [
    '## A heading\n\nBody.',
    '- a list\n- of things',
    '1. ordered',
    '> a quote',
    'code:\n\n```\nblock\n```',
    'A [link](https://example.com) inline.',
    'Some **bold** text.',
    'Some _emphasis_ here.',
    '| a | table |',
  ]
  for (const sample of samples) {
    assert.equal(markdownToPortableText(sample), null, sample)
  }
})

test('apostrophes, semicolons and unicode pass through untouched', () => {
  const blocks = markdownToPortableText("Maison Caspari's watercolours; Braquenié since 1824.")
  assert.equal(blocks[0].children[0].text, "Maison Caspari's watercolours; Braquenié since 1824.")
})
