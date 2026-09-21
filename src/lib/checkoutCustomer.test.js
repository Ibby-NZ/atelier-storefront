import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_CUSTOMER, customerFromPrefill, customerBody } from './checkoutCustomer.js'

test('a prefill lands on the blank form and absent fields stay blank', () => {
  assert.deepEqual(customerFromPrefill(null), EMPTY_CUSTOMER)
  const form = customerFromPrefill({
    name: 'Studio Marlow',
    email: 'o@marlow.test',
    phone: '021 555 000',
    address: { line1: '12 Parnell Road', city: 'Auckland', postal_code: '1052' },
  })
  assert.equal(form.line1, '12 Parnell Road')
  assert.equal(form.line2, '')
  assert.equal(form.postal_code, '1052')
})

test('the body is trimmed, email lower-cased, and blank line2 omitted', () => {
  const body = customerBody({
    ...EMPTY_CUSTOMER,
    name: ' Olivia ',
    email: 'O@Marlow.Test',
    phone: '021',
    line1: '12 Parnell Road',
    line2: '  ',
    city: 'Auckland',
    postal_code: '1052',
  })
  assert.deepEqual(body, {
    name: 'Olivia',
    email: 'o@marlow.test',
    phone: '021',
    address: { line1: '12 Parnell Road', city: 'Auckland', postal_code: '1052' },
  })
  assert.equal(customerBody({ ...EMPTY_CUSTOMER, line2: 'Level 2' }).address.line2, 'Level 2')
})
