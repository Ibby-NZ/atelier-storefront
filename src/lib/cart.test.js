import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldClearCartAfterFailedVerify } from './cart.js'

// The rule this guards is a money rule, not a tidiness one: /checkout/success is
// only ever reached through a Stripe redirect, which happens after the payment
// is taken. A cart left full there is a cart the shopper can be walked back into
// buying a second time.
test('a failed verify empties the cart unless Stripe disowned the session', async (t) => {
  await t.test('our side failing clears it — the shopper has very likely paid', () => {
    // apiFetch wraps a network error (API down, wifi dropped) as status 0.
    assert.equal(shouldClearCartAfterFailedVerify({ status: 0 }), true)
    assert.equal(shouldClearCartAfterFailedVerify({ status: 500 }), true)
    assert.equal(shouldClearCartAfterFailedVerify({ status: 502 }), true)
    // 503 is the API with card payments switched off — still says nothing about
    // a payment Stripe has already taken.
    assert.equal(shouldClearCartAfterFailedVerify({ status: 503 }), true)
  })

  await t.test('404 keeps it — the session is unvouched, so the link may be forged', () => {
    // retrieveCheckoutSession answers 404 when Stripe does not know the id. A
    // crafted /checkout/success?session_id=... must not empty a real basket.
    assert.equal(shouldClearCartAfterFailedVerify({ status: 404 }), false)
  })

  await t.test('a throw carrying no status clears it', () => {
    // Reached only after the fetch RESOLVED, so the payment is real and the
    // fault is ours.
    assert.equal(shouldClearCartAfterFailedVerify(new TypeError('boom')), true)
    assert.equal(shouldClearCartAfterFailedVerify(undefined), true)
  })
})
