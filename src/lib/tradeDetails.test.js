import test from 'node:test'
import assert from 'node:assert/strict'
import { TRADE_DETAIL_FIELDS, tradeDetailsErrors, tradeDetailsPatch } from './tradeDetails.js'

test('the form never offers the consent block', () => {
  const keys = TRADE_DETAIL_FIELDS.map((f) => f.key)
  for (const banned of ['terms_accepted', 'signature', 'signatory_name', 'signatory_position', 'customer_full_name']) {
    assert.equal(keys.includes(banned), false, banned)
  }
  assert.equal(new Set(keys).size, keys.length)
})

test('tradeDetailsPatch trims text and reads booleans off their checkbox', () => {
  const form = new Map([
    ['business_name', '  Studio  '],
    ['mailchimp_opt_in', 'on'],
    ['nzbn', ''],
  ])
  const patch = tradeDetailsPatch(form)
  assert.equal(patch.business_name, 'Studio')
  assert.equal(patch.mailchimp_opt_in, true)
  assert.equal(patch.wants_showroom_visit, false)
  assert.equal(patch.nzbn, '')
  assert.equal(Object.keys(patch).length, TRADE_DETAIL_FIELDS.length)
})

test('tradeDetailsErrors keys the API refusal by the form field', () => {
  assert.deepEqual(tradeDetailsErrors([{ field: 'application.nzbn', message: 'Enter your NZBN.' }, { message: 'x' }]), {
    nzbn: 'Enter your NZBN.',
  })
  assert.deepEqual(tradeDetailsErrors(undefined), {})
})
