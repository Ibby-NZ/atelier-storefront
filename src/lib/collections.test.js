import test from 'node:test'
import assert from 'node:assert/strict'
import { collectionTiles } from './collections.js'

const LIVE = [
  {
    slug: 'giverny',
    name: 'Giverny',
    description: 'Archival prints rich in colour.',
    image_url: 'https://www.atelier.co.nz/uploads/giverny.jpg',
    product_count: 0,
  },
  { slug: 'le-voyage', name: 'Le Voyage', description: null, image_url: null, product_count: 6 },
]

test('the gate is brand-level: no products under the house, no section', () => {
  assert.deepEqual(
    collectionTiles({ collections: LIVE, cards: [], brandSlug: 'manuel-canovas' }),
    []
  )
  assert.deepEqual(
    collectionTiles({
      collections: LIVE,
      brandSlug: 'manuel-canovas',
      brandHasProducts: false,
    }),
    []
  )
})

test('with products under the house, EVERY live collection tiles — assigned or not', () => {
  const tiles = collectionTiles({
    collections: LIVE,
    cards: [],
    brandSlug: 'manuel-canovas',
    brandHasProducts: true,
  })
  assert.deepEqual(
    tiles.map((tile) => tile.slug),
    ['giverny', 'le-voyage']
  )
})

test('a tile never lands on an empty grid: unassigned collections fall back to the house grid', () => {
  const tiles = collectionTiles({
    collections: LIVE,
    cards: [],
    brandSlug: 'manuel-canovas',
    brandHasProducts: true,
  })
  // No members yet -> the house's full grid; members -> the collection grid.
  assert.equal(tiles[0].href, '/products?brand=manuel-canovas')
  assert.equal(tiles[1].href, '/products?brand=manuel-canovas&collection=le-voyage')
})

test('API editorial fills the tile; a matching CMS card wins over it', () => {
  const plain = collectionTiles({
    collections: LIVE,
    cards: [],
    brandSlug: 'manuel-canovas',
    brandHasProducts: true,
  })[0]
  assert.equal(plain.description, 'Archival prints rich in colour.')
  assert.equal(plain.image, 'https://www.atelier.co.nz/uploads/giverny.jpg')
  assert.equal(plain.heading, 'Giverny')

  const dressed = collectionTiles({
    collections: LIVE,
    cards: [
      {
        collection: 'giverny',
        heading: 'Giverny — SS26',
        description: 'CMS copy.',
        featuredImage: '/img/cms.jpg',
      },
    ],
    brandSlug: 'manuel-canovas',
    brandHasProducts: true,
  })[0]
  assert.equal(dressed.heading, 'Giverny — SS26')
  assert.equal(dressed.description, 'CMS copy.')
  assert.equal(dressed.image, '/img/cms.jpg')
})

test('a pre-join card still matches when its heading equals the collection name', () => {
  const tiles = collectionTiles({
    collections: LIVE,
    cards: [{ heading: 'le voyage', description: 'Older editorial.' }],
    brandSlug: 'manuel-canovas',
    brandHasProducts: true,
  })
  assert.equal(tiles.find((tile) => tile.slug === 'le-voyage').description, 'Older editorial.')
})

test('a card matching no live collection renders nothing', () => {
  const tiles = collectionTiles({
    collections: LIVE,
    cards: [{ collection: 'no-such-collection', heading: 'Ghost', description: 'x' }],
    brandSlug: 'manuel-canovas',
    brandHasProducts: true,
  })
  assert.equal(tiles.length, 2)
  assert.ok(!tiles.some((tile) => tile.heading === 'Ghost'))
})

test('slugs are URL-encoded into the href and inputs default safely', () => {
  const tiles = collectionTiles({
    collections: [{ slug: 'faux&bois', name: 'Faux', product_count: '3' }],
    brandSlug: 'maison co',
    brandHasProducts: true,
  })
  assert.equal(tiles[0].href, '/products?brand=maison%20co&collection=faux%26bois')
  // pg-numeric-style string count still counts as stocked.
  assert.equal(tiles[0].productCount, 3)
  assert.deepEqual(collectionTiles({ brandSlug: 'x', brandHasProducts: true }), [])
})
