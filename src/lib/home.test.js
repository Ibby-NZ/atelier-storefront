import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bandPhotographs,
  brandDesignCounts,
  collectionBySlug,
  collectionHref,
  houseLabel,
  pickCollections,
} from './home.js'

const collection = (slug, brandSlug, productCount = 0) => ({
  slug,
  name: slug,
  product_count: productCount,
  brand: { slug: brandSlug, name: brandSlug },
})

const LIVE = [
  collection('nature-s-opera', 'de-le-cuona'),
  collection('manuel-canovas-giverny', 'manuel-canovas'),
  collection('larsen-2024', 'larsen'),
  collection('pierre-frey-cappuccino', 'pierre-frey'),
  collection('no-9-thompson-feuillage', 'no-9-thompson'),
]

test('brandDesignCounts counts by brand slug and ignores brandless rows', () => {
  const counts = brandDesignCounts([
    { brand: { slug: 'larsen' } },
    { brand: { slug: 'larsen' } },
    { brand: { slug: 'pierre-frey' } },
    {},
    { brand: {} },
  ])
  assert.deepEqual(counts, { larsen: 2, 'pierre-frey': 1 })
})

test('brandDesignCounts does not mutate its input', () => {
  const products = [{ brand: { slug: 'larsen' } }]
  brandDesignCounts(products)
  assert.deepEqual(products, [{ brand: { slug: 'larsen' } }])
})

test('a collection with products deep-links into the library', () => {
  assert.equal(
    collectionHref(collection('larsen-2024', 'larsen', 4), 4),
    '/products?brand=larsen&collection=larsen-2024'
  )
})

test('a memberless collection falls back to its house grid', () => {
  assert.equal(collectionHref(collection('larsen-2024', 'larsen'), 4), '/products?brand=larsen')
})

test('a house we hold no designs from falls back to the house page', () => {
  assert.equal(
    collectionHref(collection('nature-s-opera', 'de-le-cuona'), 0),
    '/brands/de-le-cuona'
  )
})

test('collectionHref encodes slugs and survives a brandless collection', () => {
  assert.equal(
    collectionHref({ slug: 'a b', product_count: 2, brand: { slug: 'c&d' } }, 1),
    '/products?brand=c%26d&collection=a%20b'
  )
  assert.equal(collectionHref({ slug: 'orphan' }), '/products')
  assert.equal(collectionHref(null), '/products')
})

test('collectionBySlug returns null rather than throwing on a retired slug', () => {
  assert.equal(collectionBySlug(LIVE, 'larsen-2024')?.slug, 'larsen-2024')
  assert.equal(collectionBySlug(LIVE, 'gone'), null)
  assert.equal(collectionBySlug(undefined, 'gone'), null)
})

test('pickCollections keeps the seasonal order', () => {
  const picked = pickCollections(LIVE, {
    slugs: ['larsen-2024', 'nature-s-opera'],
    count: 2,
  })
  assert.deepEqual(
    picked.map((entry) => entry.slug),
    ['larsen-2024', 'nature-s-opera']
  )
})

test('pickCollections tops the row up when a seasonal slug is gone', () => {
  const picked = pickCollections(LIVE, { slugs: ['larsen-2024', 'retired'], count: 4 })
  assert.equal(picked.length, 4)
  assert.equal(picked[0].slug, 'larsen-2024')
  assert.equal(new Set(picked.map((entry) => entry.slug)).size, 4)
})

test('pickCollections never repeats a collection shown elsewhere on the page', () => {
  const picked = pickCollections(LIVE, {
    slugs: ['nature-s-opera', 'manuel-canovas-giverny'],
    count: 4,
    exclude: ['nature-s-opera', 'larsen-2024'],
  })
  const slugs = picked.map((entry) => entry.slug)
  assert.ok(!slugs.includes('nature-s-opera'))
  assert.ok(!slugs.includes('larsen-2024'))
  assert.equal(slugs[0], 'manuel-canovas-giverny')
})

test('pickCollections returns what it can when the catalogue is short or empty', () => {
  assert.equal(pickCollections(LIVE.slice(0, 2), { count: 4 }).length, 2)
  assert.deepEqual(pickCollections([], { slugs: ['larsen-2024'] }), [])
  assert.deepEqual(pickCollections(), [])
})

const imaged = (...urls) => urls.map((image_url) => ({ image_url }))

test('bandPhotographs prefers collection photography over product shots', () => {
  assert.deepEqual(
    bandPhotographs({
      collections: imaged('c1', 'c2'),
      products: imaged('p1', 'p2'),
      count: 3,
    }),
    ['c1', 'c2', 'p1']
  )
})

test('bandPhotographs never repeats a picture already on the page', () => {
  assert.deepEqual(
    bandPhotographs({
      collections: imaged('c1', 'c2', 'c3'),
      products: imaged('p1'),
      claimed: ['c1', 'c3', null, undefined],
      count: 3,
    }),
    ['c2', 'p1', null]
  )
})

test('bandPhotographs never hands the same picture to two bands', () => {
  const picked = bandPhotographs({
    collections: imaged('c1', 'c1', 'c2'),
    products: imaged('c2', 'p1'),
    count: 4,
  })
  assert.deepEqual(picked, ['c1', 'c2', 'p1', null])
})

test('bandPhotographs skips missing images and pads to the requested count', () => {
  assert.deepEqual(
    bandPhotographs({ collections: imaged(null, 'c1', ''), count: 3 }),
    ['c1', null, null]
  )
  assert.deepEqual(bandPhotographs(), [null, null, null, null])
})

test('houseLabel drops the house when the collection name already starts with it', () => {
  assert.equal(houseLabel('Larsen 2024', 'Larsen'), null)
  assert.equal(houseLabel('Manuel Canovas 2024', 'Manuel Canovas'), null)
  assert.equal(houseLabel('larsen 2024', 'Larsen'), null)
})

test('houseLabel keeps the house when the name only mentions it later, or not at all', () => {
  assert.equal(houseLabel("Nature's Opera", 'de Le Cuona'), 'de Le Cuona')
  assert.equal(
    houseLabel("India Mahdavi's True Velvet Collection", 'Pierre Frey'),
    'Pierre Frey'
  )
})

test('houseLabel yields null for a missing house rather than an empty line', () => {
  assert.equal(houseLabel('Larsen 2024', null), null)
  assert.equal(houseLabel('Larsen 2024', '   '), null)
  assert.equal(houseLabel(null, 'Larsen'), 'Larsen')
})
