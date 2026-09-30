// Reorder: turning a past order back into something the shopper can place.
//
// There is no server-side "place this order again" and there deliberately
// should not be. A fabric order goes through FR-5: the back office verifies
// stock, cutting and batch shading, then prices it. A button that re-submitted
// silently would skip the one step the whole order flow exists for — and it
// would re-reserve metres against inventory without anyone looking at it. So
// reorder REBUILDS THE BASKET and hands the shopper back to the normal flow:
// fabric lines refill the request list, finished goods refill the cart, and the
// shopper reviews and submits as usual.
//
// The two destinations are not a detail. An order can contain both kinds, and
// each has its own storage, its own page and its own ending (a cut request vs a
// Stripe checkout). Sending everything to one of them would silently drop half
// the order — which reads as a broken button, not as a design choice.
//
// Pure — no storage, no DOM, no fetch. The island calls these and then hands the
// result to requestList.js / cart.js. Guarded by reorder.test.js.

import { STORE_CURRENCY } from './money.js'

/** Order kinds whose lines were cut to order, and go back to the request list. */
const FABRIC_TYPE = 'fabric'
const FINISHED_TYPE = 'finished_good'

// Whether a line goes back in the CART (1 Oct 2026): the product is sold
// retail today (the CRM's Retail tick), and the amount is one the cart takes —
// whole units, so a part metre of a Retail fabric is quoted. Every other line
// goes back on the quote request. An API that predates the tick sends no
// `sell_retail`, and the type decides as it did.
const toCart = (line) => {
  const retail = typeof line.sell_retail === 'boolean' ? line.sell_retail : line.product_type === FINISHED_TYPE
  if (!retail) return false
  return line.product_type !== FABRIC_TYPE || Number.isInteger(Number(line.qty))
}

const linesOf = (order) => (Array.isArray(order?.lines) ? order.lines : [])

/**
 * The cloth lines of an order, as request-list items.
 *
 * `in_stock` is deliberately FALSE for every rebuilt line rather than carried
 * over: what was in stock when the order was placed says nothing about today,
 * and `false` is the safe direction — it shows the lead-time checkbox, where the
 * opposite mistake is a 422 from `POST /orders/request` at submit. The island
 * refreshes the real state through `applyProductRefresh` immediately after.
 *
 * `image_url` is null for the same reason: the order carries no image, and
 * the refresh fills it in.
 *
 * @param {object} order  an order from GET /orders/mine
 * @returns {object[]}  requestList.js line shape
 */
export function toRequestLines(order) {
  return linesOf(order)
    .filter((line) => !toCart(line) && line.sku)
    .map((line) => ({
      sku: line.sku,
      slug: line.slug ?? null,
      name: line.product_name ?? null,
      brand: line.brand_name ?? null,
      colourway: line.colourway_name ?? null,
      image_url: null,
      in_stock: false,
      lead_time: line.lead_time ?? null,
      metres: metresOf(line),
      // A finished good is quoted in whole units (requestList.js lineUnit).
      ...(line.product_type === FABRIC_TYPE ? {} : { unit: 'unit' }),
      // The original cutting instructions come back with the line. They are the
      // part of a repeat order most likely to be identical, and the shopper can
      // edit or clear them on the request page.
      cut_requirements: line.cut_requirements ?? null,
    }))
}

// Order quantities arrive from pg as numeric STRINGS ('10.00'). A line whose qty
// will not parse falls back to 1 rather than 0 — a zero-metre line would be
// rejected by the API and reads as a dropped line.
function metresOf(line) {
  const qty = Number(line.qty)
  return Number.isFinite(qty) && qty > 0 ? Math.round(qty * 100) / 100 : 1
}

/**
 * The finished-good lines of an order, as cart items.
 *
 * `price_cents` comes from the ORDER, not from today's catalogue, so a repeat
 * order of something since repriced shows the OLD figure until checkout. That is
 * a display staleness, never a pricing one: `POST /checkout/session` accepts no
 * price from the client and resolves every SKU server-side, so the amount Stripe
 * charges is always today's. (The cart page reads localStorage and does not
 * refetch — unlike the request list, which folds a fresh product read back over
 * its lines via `applyProductRefresh`.)
 *
 * @param {object} order
 * @returns {object[]}  cart.js line shape
 */
export function toCartLines(order) {
  return linesOf(order)
    .filter((line) => toCart(line) && line.sku)
    .map((line) => ({
      sku: line.sku,
      slug: line.slug ?? null,
      name: line.product_name ?? null,
      price_cents: Number(line.unit_price_cents) || 0,
      currency: STORE_CURRENCY,
      qty: Math.max(Math.floor(Number(line.qty) || 1), 1),
    }))
}

/**
 * What a Reorder button would actually do, so the UI can label it honestly and
 * hide it where it would do nothing.
 *
 * `destination` is the page to send the shopper to afterwards. A mixed order
 * fills BOTH baskets and lands on the request list, because the cut request is
 * the half that needs a human — the cart is still there when they are done.
 *
 * @param {object} order
 * @returns {{ fabric: number, goods: number, total: number, destination: string|null }}
 */
export function reorderPlan(order) {
  const fabric = toRequestLines(order)
  const goods = toCartLines(order)
  return {
    fabric: fabric.length,
    goods: goods.length,
    total: fabric.length + goods.length,
    destination: fabric.length > 0 ? '/order-request' : goods.length > 0 ? '/cart' : null,
  }
}

/**
 * Can this order be reordered at all?
 *
 * False for an order whose every line has lost its product (the API joins
 * through colourways, so a line only survives while its colourway does) — the
 * button is hidden rather than shown and then failing.
 *
 * @param {object} order
 * @returns {boolean}
 */
export const canReorder = (order) => reorderPlan(order).total > 0

/**
 * Is this order's money real, or is it the placeholder a fabric request carries
 * until the back office prices it?
 *
 * `createOrderRequest` writes `unit_price_cents = 0` and zero totals, and
 * nothing fills them in — the amount is set manually in Xero at confirmation.
 * Rendering those verbatim puts "$0.00" on every fabric order a designer ever
 * placed, which reads as a bug.
 *
 * Keyed on the TOTAL BEING ZERO, not on the status: an order stays at zero after
 * it is confirmed, paid and shipped, so a status test would put $0.00 back on
 * exactly the orders a client is most likely to open.
 *
 * @param {object} order
 * @returns {boolean}
 */
export function hasQuotedTotal(order) {
  if (!order) return false
  const total = Number(order.total_cents)
  return Number.isFinite(total) && total > 0
}
