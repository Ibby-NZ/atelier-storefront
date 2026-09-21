import test from 'node:test'
import assert from 'node:assert/strict'
import { GST_RATE, gstCents } from './gst.js'

test('gstCents is 15% in whole cents, rounding half up like the API', () => {
  assert.equal(GST_RATE, 0.15)
  assert.equal(gstCents(10000), 1500)
  assert.equal(gstCents(1230), 185) // 184.5 → 185
  assert.equal(gstCents(0), 0)
  assert.equal(gstCents('20000'), 3000)
})
