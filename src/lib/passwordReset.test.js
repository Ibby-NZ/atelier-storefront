import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readResetToken, newPasswordError, MIN_PASSWORD_LENGTH } from './passwordReset.js'

test('readResetToken pulls the token out of the emailed link', () => {
  assert.equal(readResetToken('?token=abc-DEF_123'), 'abc-DEF_123')
  assert.equal(readResetToken('?redirect=/account&token=%20x%20'), 'x')
  assert.equal(readResetToken('?token='), '')
  assert.equal(readResetToken(''), '')
  assert.equal(readResetToken(undefined), '')
})

test('newPasswordError holds the API floor and the confirmation', () => {
  const ok = 'a'.repeat(MIN_PASSWORD_LENGTH)
  assert.equal(newPasswordError('', ''), 'Choose a new password.')
  assert.equal(newPasswordError('short', 'short'), `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  assert.equal(newPasswordError(ok, `${ok}x`), 'The two passwords do not match.')
  assert.equal(newPasswordError(ok, ok), '')
})
