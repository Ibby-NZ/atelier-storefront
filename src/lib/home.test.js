import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bandPhotographs,
  brandDesignCounts,
  collectionArtwork,
  collectionHref,
  collectionKey,
  featuredCollections,
  houseLabel,
  pickFeature,
} from './home.js'

const collection = (slug, brandSlug, productCount = 0) => ({
  slug,
  name: slug,
  product_count: productCount,
  brand: { slug: brandSlug, name: brandSlug },
})

/** A collection as the API sends it: featured, with its own photograph. */
const featuredRow = (slug, brandSlug, rank, image_url = null) => ({
  ...collection(slug, brandSlug),
  featured_rank: rank,
  image_url,
})

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

test('collectionKey is the (house, collection) pair, never the slug alone', () => {
  assert.equal(collectionKey(collection('larsen-2024', 'larsen')), 'larsen/larsen-2024')
  assert.notEqual(
    collectionKey(collection('2024', 'larsen')),
    collectionKey(collection('2024', 'dedar'))
  )
})

test('collectionKey yields null for a collection with no house to pair it to', () => {
  assert.equal(collectionKey({ slug: 'orphan' }), null)
  assert.equal(collectionKey({ brand: { slug: 'larsen' } }), null)
  assert.equal(collectionKey(null), null)
  assert.equal(collectionKey(undefined), null)
})

test('featuredCollections takes only the featured rows, in the office order', () => {
  const rows = [
    featuredRow('third', 'a', 3),
    { ...collection('unfeatured', 'b'), featured_rank: null },
    featuredRow('first', 'c', 1),
    featuredRow('second', 'd', 2),
  ]
  assert.deepEqual(
    featuredCollections(rows).map((entry) => entry.slug),
    ['first', 'second', 'third']
  )
})

test('featuredCollections breaks a shared rank on the order the API gave', () => {
  // featured_rank carries no unique index on purpose, so two collections really
  // can share one — the tie has to break on something deterministic.
  const rows = [featuredRow('b', 'x', 2), featuredRow('a', 'y', 2), featuredRow('lead', 'z', 1)]
  assert.deepEqual(
    featuredCollections(rows).map((entry) => entry.slug),
    ['lead', 'b', 'a']
  )
})

test('featuredCollections treats a rank that is not a positive integer as unfeatured', () => {
  const rows = [
    featuredRow('zero', 'a', 0),
    featuredRow('negative', 'b', -1),
    featuredRow('fractional', 'c', 1.5),
    featuredRow('blank', 'd', ''),
    featuredRow('text', 'e', 'first'),
    featuredRow('real', 'f', 4),
  ]
  assert.deepEqual(
    featuredCollections(rows).map((entry) => entry.slug),
    ['real']
  )
})

test('featuredCollections caps the list and leaves its input alone', () => {
  const rows = [featuredRow('c', 'a', 3), featuredRow('a', 'b', 1), featuredRow('b', 'c', 2)]
  assert.deepEqual(
    featuredCollections(rows, 2).map((entry) => entry.slug),
    ['a', 'b']
  )
  assert.deepEqual(
    rows.map((entry) => entry.slug),
    ['c', 'a', 'b']
  )
  assert.deepEqual(featuredCollections(rows, 0), [])
  assert.deepEqual(featuredCollections(), [])
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

// The committed art is an ImageMetadata the build produces; the chain only ever
// passes it through, so a sentinel object stands in for one here.
const LARSEN_BANNER = { src: '/_astro/larsen.webp' }
const ART = { 'larsen/larsen-2024': LARSEN_BANNER }

test('collectionArtwork prefers the art commissioned for that collection', () => {
  assert.deepEqual(collectionArtwork(ART, featuredRow('larsen-2024', 'larsen', 1, '/room.jpg')), {
    image: LARSEN_BANNER,
    src: null,
  })
})

test('collectionArtwork falls back to the collection own catalogue photograph', () => {
  assert.deepEqual(collectionArtwork(ART, featuredRow('giverny', 'manuel-canovas', 2, '/g.jpg')), {
    image: null,
    src: '/g.jpg',
  })
})

test('collectionArtwork reports no photograph rather than an empty src', () => {
  assert.deepEqual(collectionArtwork(ART, featuredRow('bare', 'dedar', 3)), {
    image: null,
    src: null,
  })
  assert.deepEqual(collectionArtwork(ART, featuredRow('blank', 'dedar', 3, '   ')), {
    image: null,
    src: null,
  })
  assert.deepEqual(collectionArtwork(undefined, undefined), { image: null, src: null })
})

test('collectionArtwork renders a CMS URL string as src, over the catalogue photograph', () => {
  // overlayArtwork (lib/emdash.js) puts plain URL strings into the registry —
  // a CMS banner upload. It must win over the collection's own image_url and
  // come out as `src`, not be mistaken for ImageMetadata.
  const art = { 'larsen/larsen-2024': '/_emdash/api/media/file/banner.jpg' }
  assert.deepEqual(collectionArtwork(art, featuredRow('larsen-2024', 'larsen', 1, '/room.jpg')), {
    image: null,
    src: '/_emdash/api/media/file/banner.jpg',
  })
})

test('collectionArtwork keys on the pair, so a same-slug collection is not handed the art', () => {
  // The regression the pair key exists to prevent: collection slugs are unique
  // per house, so another maison may well hold a "larsen-2024" of its own.
  const impostor = featuredRow('larsen-2024', 'dedar', 1, '/dedar.jpg')
  assert.deepEqual(collectionArtwork(ART, impostor), { image: null, src: '/dedar.jpg' })
})

test('pickFeature takes the collection the portrait was shot for, not the top rank', () => {
  const featured = [
    featuredRow('nature-s-opera', 'de-le-cuona', 1, '/opera.jpg'),
    featuredRow('larsen-2024', 'larsen', 2),
  ]
  assert.equal(pickFeature(featured, ART).slug, 'larsen-2024')
})

test('pickFeature falls back to the first featured collection with a picture', () => {
  const featured = [
    featuredRow('bare', 'dedar', 1),
    featuredRow('giverny', 'manuel-canovas', 2, '/g.jpg'),
    featuredRow('cappuccino', 'pierre-frey', 3, '/c.jpg'),
  ]
  assert.equal(pickFeature(featured, ART).slug, 'giverny')
})

test('pickFeature yields null when nothing featured has a photograph at all', () => {
  assert.equal(pickFeature([featuredRow('bare', 'dedar', 1)], ART), null)
  assert.equal(pickFeature([], ART), null)
  assert.equal(pickFeature(), null)
})
