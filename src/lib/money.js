// Shared money formatter. Prices are stored as integer cents in the API and the
// client cart; render them in the product's currency (NZD by default). Falls
// back to a plain string if the currency code is not recognised by Intl.

export function formatMoney(cents, currency = 'NZD') {
  const amount = Number(cents) / 100
  try {
    return new Intl.NumberFormat('en-NZ', {
      style: 'currency',
      currency: currency || 'NZD',
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency || 'NZD'}`
  }
}
