import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BESPOKE_HOUSES,
  PRICE_VALIDITY_NOTE,
  findBespokeHouse,
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
