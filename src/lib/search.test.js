import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SITE_PAGES,
  brandText,
  cmsPageHit,
  matchesWords,
  normaliseQuery,
  pageText,
  portableTextToString,
  queryWords,
  searchIndex,
} from './search.js'

test('normaliseQuery collapses whitespace, trims, caps, and refuses non-strings', () => {
  assert.equal(normaliseQuery('  linen \n throw  '), 'linen throw')
  assert.equal(normaliseQuery('x'.repeat(300)).length, 200)
  assert.equal(normaliseQuery(null), '')
  assert.equal(normaliseQuery(['a']), '')
})

test('every word must match, case-insensitively', () => {
  const words = queryWords('Linen Throw')
  assert.equal(matchesWords('A washed LINEN throw', words), true)
  assert.equal(matchesWords('A linen cushion', words), false)
  assert.equal(matchesWords('anything', []), false)
  assert.equal(matchesWords(null, words), false)
})

test('searchIndex filters by toText and returns nothing for an empty query', () => {
  const items = [{ name: 'Dedar', country: 'Italy' }, { name: 'Zimmer + Rohde', country: 'Germany' }]
  assert.deepEqual(searchIndex(items, 'italy', brandText), [items[0]])
  assert.deepEqual(searchIndex(items, '   ', brandText), [])
})

test('the fixed page index reaches the showrooms and trade application', () => {
  const hrefs = (q) => searchIndex(SITE_PAGES, q, pageText).map((page) => page.href)
  assert.ok(hrefs('wellington showroom').includes('/contact'))
  assert.ok(hrefs('trade account').includes('/trade-application'))
  assert.deepEqual(hrefs('zzzz'), [])
  assert.ok(Object.isFrozen(SITE_PAGES) && Object.isFrozen(SITE_PAGES[0]))
})

test('a CMS page becomes a hit at /<slug>; fixed company pages are skipped', () => {
  const content = [{ _type: 'block', children: [{ text: 'Care ' }, { text: 'guide' }] }, { _type: 'image' }]
  assert.equal(portableTextToString(content), 'Care  guide')
  assert.deepEqual(cmsPageHit({ slug: 'care', title: 'Fabric care', content }), {
    href: '/care',
    title: 'Fabric care',
    description: 'Care  guide',
    keywords: [],
  })
  assert.equal(cmsPageHit({ slug: 'contact', title: 'Contact', content: null }), null)
  assert.equal(cmsPageHit({ slug: '', title: 'x' }), null)
})
