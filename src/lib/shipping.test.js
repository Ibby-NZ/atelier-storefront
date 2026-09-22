import test from 'node:test'
import assert from 'node:assert/strict'
import { NZ_REGIONS, RATE_ZONES, REGION_ZONES, zoneForRegion } from './shipping.js'

// A region with no zone behind it is a checkout that cannot quote: the rate
// reads "—", the total never resolves and Pay now buys nothing. So the rule
// worth a test is that every name the field offers maps to a zone the API
// actually prices.
const SEEDED_ZONES = ['Auckland', 'North Island', 'South Island']

test('every region in the field bills against a seeded zone', () => {
  for (const region of NZ_REGIONS) {
    assert.ok(
      SEEDED_ZONES.includes(zoneForRegion(region)),
      `${region} maps to "${zoneForRegion(region)}", which the API cannot quote`
    )
  }
})

test('the zones quoted are the seeded ones, asked for once each', () => {
  assert.deepEqual([...RATE_ZONES], SEEDED_ZONES)
})

test('the field lists the sixteen NZ regions plus the Chathams', () => {
  assert.equal(NZ_REGIONS.length, 17)
  // Auckland is the default because it is first, so the order is load-bearing.
  assert.equal(NZ_REGIONS[0], 'Auckland')
  assert.deepEqual([...NZ_REGIONS].sort((a, b) => a.localeCompare(b, 'en')), [...NZ_REGIONS])
})

test('islands are not crossed', () => {
  assert.equal(REGION_ZONES.Waikato, 'North Island')
  assert.equal(REGION_ZONES.Otago, 'South Island')
  // Auckland has its own tiers and must not fall into the North Island band.
  assert.equal(REGION_ZONES.Auckland, 'Auckland')
})

test('a name we do not know has no zone rather than a guessed one', () => {
  assert.equal(zoneForRegion('Queensland'), undefined)
  assert.equal(zoneForRegion(''), undefined)
})
