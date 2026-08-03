import test from 'node:test'
import assert from 'node:assert/strict'
import { tradeStatus, isApprovedTrade, tradeStatusNote, TRADE_STATUS } from './account.js'

test('tradeStatus: logged out and non-trade roles are "none"', () => {
  assert.equal(tradeStatus(null), TRADE_STATUS.NONE)
  assert.equal(tradeStatus(undefined), TRADE_STATUS.NONE)
  assert.equal(tradeStatus({ role: 'customer', trade_approved: false }), TRADE_STATUS.NONE)
  // Staff are not trade: requireRole('trade') on the API excludes them too.
  assert.equal(tradeStatus({ role: 'backoffice', trade_approved: true }), TRADE_STATUS.NONE)
})

test('tradeStatus: an applicant is pending until the flag is flipped', () => {
  assert.equal(tradeStatus({ role: 'trade', trade_approved: false }), TRADE_STATUS.PENDING)
  assert.equal(tradeStatus({ role: 'trade', trade_approved: true }), TRADE_STATUS.APPROVED)
})

test('isApprovedTrade is true only for an approved trade account', () => {
  assert.equal(isApprovedTrade({ role: 'trade', trade_approved: true }), true)
  assert.equal(isApprovedTrade({ role: 'trade', trade_approved: false }), false)
  assert.equal(isApprovedTrade({ role: 'customer', trade_approved: true }), false)
  assert.equal(isApprovedTrade(null), false)
})

test('tradeStatusNote: a pending applicant is told they are pending', () => {
  const note = tradeStatusNote({ role: 'trade', trade_approved: false })
  assert.match(note.label, /review/i)
  assert.equal(note.tone, 'pending')
})

test('tradeStatusNote: an approved account is told it is approved', () => {
  const note = tradeStatusNote({ role: 'trade', trade_approved: true })
  assert.match(note.label, /approved/i)
  assert.equal(note.tone, 'approved')
})

test('tradeStatusNote: nothing to say to a customer or a guest', () => {
  assert.equal(tradeStatusNote({ role: 'customer', trade_approved: false }), null)
  assert.equal(tradeStatusNote(null), null)
})
