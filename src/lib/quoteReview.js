// The pure half of answering a quote (24 Sep 2026): the /quote page a guest
// reaches from the `quote_sent` letter's link, and the same Accept / Reject on
// an order in My Account. The API is the gate — it answers 409 unless the order
// is still `quote_sent`, and 422 for a rejection with no reason — so these only
// save a round trip and word the outcome.

// The API's `REJECTION_REASON_MAX` (atelier-api src/orders/quote-response.js),
// spent as the textarea's maxLength.
export const REJECTION_REASON_MAX = 2000

// The token rides in ?token= on the emailed link. Null when absent.
export function tokenFromLocation(search) {
  return new URLSearchParams(search || '').get('token')?.trim() || null
}

// A rejection must say why — it is what the office re-quotes from. The API
// answers 422 with this same field for a blank one.
export function validateRejection(reason) {
  if (typeof reason !== 'string' || reason.trim() === '') {
    return { ok: false, error: 'Tell us why so we can re-quote.' }
  }
  return { ok: true }
}

// Only a quote that is out and unanswered can be accepted or rejected.
export function canRespond(order) {
  return order?.status === 'quote_sent'
}

// What the page says once the quote is no longer open to an answer.
export function outcomeText(order) {
  switch (order?.status) {
    case 'quote_accepted':
      return 'You accepted this quote. We will be in touch to arrange the invoice.'
    case 'quote_rejected':
      return 'You turned this quote down. We will look at your note and come back to you.'
    case 'quote_requested':
      return 'We are revising this quote. A new one will follow by email.'
    case 'cancelled':
      return 'This order has been cancelled.'
    default:
      return 'This quote has been accepted and the order is under way.'
  }
}
