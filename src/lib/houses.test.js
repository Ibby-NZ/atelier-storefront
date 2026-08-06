import test from 'node:test'
import assert from 'node:assert/strict'
import { FOCUS_SLOTS, featuredHouses, houseArtwork } from './houses.js'

/** A house as /catalogue/brands sends it: featured or not. */
const house = (slug, rank = null) => ({
  slug,
  name: slug,
  country: 'France',
  is_international: true,
  featured_rank: rank,
})

test('featuredHouses takes only the featured houses, in the office order', () => {
  const brands = [
    house('third', 3),
    house('unfeatured'),
    house('first', 1),
    house('second', 2),
  ]
  assert.deepEqual(
    featuredHouses(brands).map((entry) => entry.slug),
    ['first', 'second', 'third']
  )
})

test('featuredHouses ignores the old heuristic entirely', () => {
  // International, and the house with the most designs held — the two inputs
  // the strip used to derive its choice from. Neither features anything now.
  const brands = [
    { ...house('derived'), is_international: true, held: 40 },
    house('chosen', 1),
  ]
  assert.deepEqual(
    featuredHouses(brands).map((entry) => entry.slug),
    ['chosen']
  )
})

test('featuredHouses breaks a shared rank on the order the API gave', () => {
  // featured_rank carries no unique index on purpose, so two houses really can
  // share one — the tie has to break on something deterministic.
  const brands = [house('b', 2), house('a', 2), house('lead', 1)]
  assert.deepEqual(
    featuredHouses(brands).map((entry) => entry.slug),
    ['lead', 'b', 'a']
  )
})

test('featuredHouses treats a rank that is not a positive integer as unfeatured', () => {
  const brands = [
    house('zero', 0),
    house('negative', -1),
    house('fractional', 1.5),
    house('blank', ''),
    house('text', 'first'),
    house('real', 4),
  ]
  assert.deepEqual(
    featuredHouses(brands).map((entry) => entry.slug),
    ['real']
  )
})

test('featuredHouses caps the strip and leaves its input alone', () => {
  const brands = [house('d', 4), house('c', 3), house('a', 1), house('b', 2)]
  assert.deepEqual(
    featuredHouses(brands, FOCUS_SLOTS).map((entry) => entry.slug),
    ['a', 'b', 'c']
  )
  assert.deepEqual(
    brands.map((entry) => entry.slug),
    ['d', 'c', 'a', 'b']
  )
})

test('featuredHouses is empty when the office has featured nothing', () => {
  assert.deepEqual(featuredHouses([house('a'), house('b')]), [])
  assert.deepEqual(featuredHouses([]), [])
  assert.deepEqual(featuredHouses(), [])
})

const SOURCES = {
  editorial: { larsen: '/editorial/larsen.jpg' },
  catalogue: { larsen: '/catalogue/larsen.jpg', dedar: '/catalogue/dedar.jpg' },
}

test('houseArtwork shows the house its own editorial photograph first', () => {
  assert.equal(houseArtwork(SOURCES, house('larsen', 1)), '/editorial/larsen.jpg')
})

test('houseArtwork falls back to a design of the house own', () => {
  assert.equal(houseArtwork(SOURCES, house('dedar', 1)), '/catalogue/dedar.jpg')
})

test('houseArtwork never borrows another house photograph', () => {
  // The rung a tile must not have: every map is read at this house's slug and
  // at no other key, so an unphotographed house gets the ground, not a
  // neighbour's interior under its own name.
  assert.equal(houseArtwork(SOURCES, house('de-le-cuona', 1)), null)
})

test('houseArtwork ignores a blank or non-string entry rather than emitting it', () => {
  const sources = {
    editorial: { larsen: '   ', dedar: 42 },
    catalogue: { larsen: '/catalogue/larsen.jpg', dedar: null },
  }
  assert.equal(houseArtwork(sources, house('larsen', 1)), '/catalogue/larsen.jpg')
  assert.equal(houseArtwork(sources, house('dedar', 1)), null)
})

test('houseArtwork survives a missing house, slug or source map', () => {
  assert.equal(houseArtwork(SOURCES, {}), null)
  assert.equal(houseArtwork(SOURCES, null), null)
  assert.equal(houseArtwork({}, house('larsen', 1)), null)
  assert.equal(houseArtwork(undefined, house('larsen', 1)), null)
})
