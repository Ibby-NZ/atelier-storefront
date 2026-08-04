// Shared money formatter. Prices are stored as integer cents in the API and the
// client cart; render them in the product's currency (NZD by default). Falls
// back to a plain string if the currency code is not recognised by Intl.

export function formatMoney(cents, currency = 'NZD') {
  return formatAmount(Number(cents) / 100, currency)
}

// Legacy Dynamics money is NOT cents: `legacy_sales_invoices.total_incl_gst` is
// a Postgres `numeric` in the INVOICE'S OWN currency, and pg hands numerics back
// as strings. Passing one through formatMoney would divide a real invoice total
// by a hundred, so the two units get two functions rather than one with a flag.
// An unparseable value renders as an em dash rather than as "NaN".
export function formatAmount(value, currency = 'NZD') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  try {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency || 'NZD',
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || 'NZD'}`
  }
}
