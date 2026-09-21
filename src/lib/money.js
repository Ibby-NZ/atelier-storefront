// Shared money formatter, and the one place the storefront says what currency a
// shopper is quoted in.

/**
 * THE CURRENCY EVERY PRICE ON THE STOREFRONT IS SHOWN IN — the customer's, never
 * the supplier's.
 *
 * `product.currency` used to be read as "this price's currency". It is not: it
 * is the SUPPLIER's currency, what Atelier pays a house in, and neither
 * `retail_price_cents` nor `trade_price_cents` is denominated in it — both are
 * stored in New Zealand cents whatever it says (the trade figure comes out of
 * the pricing waterfall, which computes in NZ$; the retail figure comes from the
 * office or from the D365 merge, which only ever fills a price from a New
 * Zealand line). Formatting a retail figure with it printed a NZ$429 towel as
 * "US$429" on the card next to a NZ$389 one, and sent the same mismatch to
 * Stripe. The API now publishes this code on every product, and the storefront
 * no longer reads a currency off a price at all.
 *
 * ONE SELLING REGION PER DEPLOYMENT — New Zealand. The shipping tiers price only
 * NZ zones, GST is 15% and one Stripe session settles in one currency, so a
 * second region is a business change (a rate source, a rounding rule, a Stripe
 * account that settles in it) and not a formatting one. Kept as a constant
 * rather than an env var for exactly that reason: setting it to a currency
 * nothing converts into would relabel NZ figures, not price them.
 */
export const STORE_CURRENCY = 'NZD'
export const STORE_REGION = 'NZ'

// Prices are integer cents in the API and in the client cart.
export function formatMoney(cents, currency = STORE_CURRENCY) {
  return formatAmount(Number(cents) / 100, currency)
}

// Legacy Dynamics money is NOT cents: `legacy_sales_invoices.total_incl_gst` is
// a Postgres `numeric` in the INVOICE'S OWN currency, and pg hands numerics back
// as strings. Passing one through formatMoney would divide a real invoice total
// by a hundred, so the two units get two functions rather than one with a flag.
// This one keeps its currency argument where the caller has one: an invoice
// already issued is a record of what was charged, not a price being quoted, so
// it is shown as it was billed.
// An unparseable value renders as an em dash rather than as "NaN".
export function formatAmount(value, currency = STORE_CURRENCY) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  try {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency || STORE_CURRENCY,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || STORE_CURRENCY}`
  }
}
