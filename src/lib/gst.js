// New Zealand GST on a card checkout. Mirrors atelier-api's src/orders/gst.js
// exactly — the store only DRAWS the figure, the API charges it — so the two
// must round the same way. Prices and freight are GST-exclusive; GST is on
// goods plus freight (domestic delivery is taxable).

export const GST_RATE = 0.15

/** GST in whole cents on a GST-exclusive amount; .5 rounds up like the API. */
export const gstCents = (exclusiveCents) => Math.round(Number(exclusiveCents) * GST_RATE)
