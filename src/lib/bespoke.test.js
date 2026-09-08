import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BESPOKE_HOUSES,
  PRICE_VALIDITY_NOTE,
  blankEnquiryState,
  findBespokeHouse,
  bespokeHouseFor,
  bespokeCards,
  bespokeSubject,
  bespokeEnquiryPayload,
} from './bespoke.js'

test('the five bespoke houses of the client brief, in the brief order', () => {
  assert.deepEqual(
    BESPOKE_HOUSES.map((house) => house.slug),
    ['pierre-frey', 'cc-milano', 'loro-piana', 'maria-flora', 'de-le-cuona']
  )
})

test('every house carries categories, a blurb and at least one image with alt text', () => {
  for (const house of BESPOKE_HOUSES) {
    assert.ok(house.name, house.slug)
    assert.ok(house.categories.length >= 1, `${house.slug} categories`)
    assert.ok(house.blurb.length > 40, `${house.slug} blurb`)
    assert.ok(house.images.length >= 1, `${house.slug} images`)
    for (const image of house.images) {
      assert.match(image.src, /^https:\/\//, `${house.slug} image src`)
      assert.ok(image.alt, `${house.slug} image alt`)
    }
  }
})

test('no house text mentions a price — bespoke is quoted, never priced', () => {
  for (const house of BESPOKE_HOUSES) {
    assert.doesNotMatch(house.blurb, /\$|NZD|price/i, house.slug)
  }
})

test('the quote validity note is the exact client wording', () => {
  assert.equal(PRICE_VALIDITY_NOTE, 'Please note, prices quoted are valid for 5 working days.')
})

test('findBespokeHouse resolves a slug and never throws on an unknown one', () => {
  assert.equal(findBespokeHouse('maria-flora').name, 'Maria Flora')
  assert.equal(findBespokeHouse('not-a-house'), null)
  assert.equal(findBespokeHouse(undefined), null)
})

// The wall is the CRM's flag, not this file's list: a house the office ticks
// appears even with no editorial here, and one it unticks disappears even with.
test('bespokeCards keeps the flagged houses — editorial photo first, house image second', () => {
  const cards = bespokeCards([
    { slug: 'pierre-frey', name: 'Pierre Frey', bespoke: true, image_url: null },
    { slug: 'houles', name: 'Houlès', bespoke: true, image_url: 'https://x/h.jpg' },
    { slug: 'de-le-cuona', name: 'de Le Cuona', bespoke: false, image_url: 'https://x/d.jpg' },
    { slug: 'no-photo', name: 'No Photo', bespoke: true },
  ])
  assert.deepEqual(
    cards.map((card) => [card.slug, card.name, card.href, card.image]),
    [
      ['pierre-frey', 'Pierre Frey', '/brands/pierre-frey', BESPOKE_HOUSES[0].images[0].src],
      ['houles', 'Houlès', '/brands/houles', 'https://x/h.jpg'],
      ['no-photo', 'No Photo', '/brands/no-photo', null],
    ]
  )
})

test('bespokeCards falls back to the editorial houses when there is no brand list', () => {
  assert.deepEqual(
    bespokeCards(null).map((card) => card.slug),
    BESPOKE_HOUSES.map((house) => house.slug)
  )
  assert.deepEqual(bespokeCards([]), [])
})

test('bespokeHouseFor takes the CRM name and the editorial categories, if any', () => {
  assert.deepEqual(bespokeHouseFor({ slug: 'loro-piana', name: 'Loro Piana' }), {
    slug: 'loro-piana',
    name: 'Loro Piana',
    categories: ['Throws', 'Cushions', 'Area rugs'],
  })
  assert.deepEqual(bespokeHouseFor({ slug: 'houles', name: 'Houlès' }), {
    slug: 'houles',
    name: 'Houlès',
    categories: [],
  })
  assert.equal(bespokeHouseFor(null), null)
})

// Switching house resets with this, so a field missing from it is a field that
// survives the switch: a `sent: true` left standing showed the "enquiry has been
// sent" panel under the next house with no form at all, and a `submitting: true`
// (never cleared on success before) would leave the button stuck on "Sending…".
test('blankEnquiryState clears the category AND the whole submission', () => {
  assert.deepEqual(blankEnquiryState(), {
    category: '',
    submitting: false,
    submitError: '',
    fieldErrors: {},
    sent: false,
  })
})

test('blankEnquiryState is a fresh object every call, errors included', () => {
  const first = blankEnquiryState()
  const second = blankEnquiryState()
  assert.notEqual(first, second)
  assert.notEqual(first.fieldErrors, second.fieldErrors)
})

test('bespokeSubject names the house, and the category only when chosen', () => {
  const house = findBespokeHouse('pierre-frey')
  assert.equal(bespokeSubject(house), 'Bespoke enquiry — Pierre Frey')
  assert.equal(bespokeSubject(house, 'Area rugs'), 'Bespoke enquiry — Pierre Frey (Area rugs)')
})

test('bespokeEnquiryPayload trims fields and omits a blank phone', () => {
  const house = findBespokeHouse('de-le-cuona')
  const payload = bespokeEnquiryPayload({
    house,
    category: 'Throws',
    name: '  Jane Doe ',
    email: ' jane@example.com ',
    phone: '  ',
    message: ' A throw in Stone Washed linen, 130 × 180. ',
  })
  assert.deepEqual(payload, {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: undefined,
    subject: 'Bespoke enquiry — de Le Cuona (Throws)',
    message: 'A throw in Stone Washed linen, 130 × 180.',
  })
})
