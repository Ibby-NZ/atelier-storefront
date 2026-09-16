import test from 'node:test'
import assert from 'node:assert/strict'
import { collectionTiles, splitCollectionName } from './collections.js'

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

test('EVERY live collection tiles — assigned, unassigned, or a house holding nothing yet', () => {
  const tiles = collectionTiles({ collections: LIVE, cards: [], brandSlug: 'manuel-canovas' })
  assert.deepEqual(
    tiles.map((tile) => tile.slug),
    ['giverny', 'le-voyage']
  )
  // The old product-count gate is gone: the wall is the design's route into a
  // house, so a house with collections always has one.
  assert.equal(collectionTiles({ collections: [], brandSlug: 'de-le-cuona' }).length, 0)
})

// Every tile lands on its OWN collection, members or not (16 Sep 2026). The
// count is computed server-side with no session cookie, so it reads 0 for every
// trade-only house — falling back on it sent every tile back to the page it was
// on. The grid is client-side, has the cookie, and explains its own gate.
test('a tile always lands on its own collection grid, never back on the house', () => {
  const tiles = collectionTiles({ collections: LIVE, cards: [], brandSlug: 'manuel-canovas' })
  assert.equal(tiles[0].href, '/products?brand=manuel-canovas&collection=giverny')
  assert.equal(tiles[1].href, '/products?brand=manuel-canovas&collection=le-voyage')
  assert.equal(tiles.filter((tile) => tile.href.startsWith('/brands/')).length, 0)
})

test('the season is split off the name onto its own label', () => {
  const tiles = collectionTiles({
    collections: [
      { slug: 'chilgrove', name: 'Chilgrove Collection | Spring 2024', product_count: 0 },
      { slug: 'canya', name: 'Canya', product_count: 0 },
    ],
    brandSlug: 'colefax-fowler',
  })
  assert.equal(tiles[0].heading, 'Chilgrove Collection')
  assert.equal(tiles[0].season, 'Spring 2024')
  // `name` keeps the CRM's own string — the label is presentation, not a rename.
  assert.equal(tiles[0].name, 'Chilgrove Collection | Spring 2024')
  assert.equal(tiles[1].heading, 'Canya')
  assert.equal(tiles[1].season, '')
})

test('splitCollectionName splits on the first pipe and never leaves a nameless tile', () => {
  assert.deepEqual(splitCollectionName('Gloriana | Autumn 2024'), {
    title: 'Gloriana',
    season: 'Autumn 2024',
  })
  assert.deepEqual(splitCollectionName('Mazan (outdoor)'), {
    title: 'Mazan (outdoor)',
    season: '',
  })
  assert.deepEqual(splitCollectionName('Rubelli | Love | Affair'), {
    title: 'Rubelli',
    season: 'Love | Affair',
  })
  assert.deepEqual(splitCollectionName('  | Spring 2024'), {
    title: 'Spring 2024',
    season: '',
  })
  assert.deepEqual(splitCollectionName(undefined), { title: '', season: '' })
})

test('API editorial fills the tile; a matching CMS card wins over it', () => {
  const plain = collectionTiles({
    collections: LIVE,
    cards: [],
    brandSlug: 'manuel-canovas',
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
  })
  assert.equal(tiles.find((tile) => tile.slug === 'le-voyage').description, 'Older editorial.')
})

test('a card matching no live collection renders nothing', () => {
  const tiles = collectionTiles({
    collections: LIVE,
    cards: [{ collection: 'no-such-collection', heading: 'Ghost', description: 'x' }],
    brandSlug: 'manuel-canovas',
  })
  assert.equal(tiles.length, 2)
  assert.ok(!tiles.some((tile) => tile.heading === 'Ghost'))
})

test('slugs are URL-encoded into the href and inputs default safely', () => {
  const tiles = collectionTiles({
    collections: [{ slug: 'faux&bois', name: 'Faux', product_count: '3' }],
    brandSlug: 'maison co',
  })
  assert.equal(tiles[0].href, '/products?brand=maison%20co&collection=faux%26bois')
  // pg-numeric-style string count still counts as stocked.
  assert.equal(tiles[0].productCount, 3)
  assert.deepEqual(collectionTiles({ brandSlug: 'x' }), [])
})
