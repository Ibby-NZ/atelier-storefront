import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenFromLocation, validateRejection, canRespond, outcomeText } from './quoteReview.js'

test('tokenFromLocation pulls the token out of the emailed link', () => {
  assert.equal(tokenFromLocation('?token=abc-DEF_123'), 'abc-DEF_123')
  assert.equal(tokenFromLocation('?x=1&token=%20t%20'), 't')
  assert.equal(tokenFromLocation('?token='), null)
  assert.equal(tokenFromLocation(''), null)
  assert.equal(tokenFromLocation(undefined), null)
})

test('validateRejection asks for a reason, in the API\'s words', () => {
  assert.deepEqual(validateRejection(''), { ok: false, error: 'Tell us why so we can re-quote.' })
  assert.deepEqual(validateRejection('   '), { ok: false, error: 'Tell us why so we can re-quote.' })
  assert.deepEqual(validateRejection(undefined), { ok: false, error: 'Tell us why so we can re-quote.' })
  assert.deepEqual(validateRejection('Too dear'), { ok: true })
})

test('canRespond only while the quote is out and unanswered', () => {
  assert.equal(canRespond({ status: 'quote_sent' }), true)
  for (const status of ['quote_requested', 'quote_accepted', 'quote_rejected', 'paid', 'cancelled']) {
    assert.equal(canRespond({ status }), false)
  }
  assert.equal(canRespond(null), false)
})

test('outcomeText words each answered state', () => {
  assert.match(outcomeText({ status: 'quote_accepted' }), /accepted this quote/)
  assert.match(outcomeText({ status: 'quote_rejected' }), /turned this quote down/)
  assert.match(outcomeText({ status: 'quote_requested' }), /revising this quote/)
  assert.match(outcomeText({ status: 'cancelled' }), /cancelled/)
  assert.match(outcomeText({ status: 'processing' }), /under way/)
})
