import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { addToCart } from '../lib/cart.js'
import {
  addToRequestList,
  normaliseMetres,
  METRES_STEP,
  MAX_METRES,
} from '../lib/requestList.js'
import {
  priceInfo,
  productClassLabel,
  weaveBackground,
  isFabric,
  TRADE_CURRENCY,
} from '../lib/catalogue.js'
import {
  isTradeGateError,
  signInHref,
  TRADE_APPLICATION_PATH,
  TRADE_GATE_COPY,
} from '../lib/tradeGate.js'

// Product detail island (US-018), 2026 direction (design: Figma "Individual
// Product Page", node 9422:4321). Fetches GET /catalogue/products/:slug for
// live availability and (for approved trade users) trade pricing.
//
// `initialProduct` is the same product already resolved server-side by
// products/[slug].astro. It is a SEED, not a replacement for the fetch: the
// server request carries no auth cookie, so it can never contain trade pricing,
// and stock moves. Seeding it means the server renders the real product markup
// (rather than "Loading product…") and the browser then refreshes it in place
// with the shopper's own view. The fetch is therefore still unconditional.
//
// 2026 layout: one raised surface-cream band, edge to edge (the page is
// `bleed`) — the photograph on the left inside a subtle hairline, and on the
// right the ochre "Fabric | House" badge, the display name, the lede, the
// price, the Size and Colour controls, the hairline spec rows, the selected
// colourway's SKU line and the action buttons (the direction's first real
// buttons — filled tan primary, hairline outline secondary). Below the band, a
// "Similar" strip of library cards from the same house.
//
// The colourway is the thing actually bought — every SKU on this page belongs
// to a colourway, not the product — so the Colour select drives the whole
// page: the hero image, the SKU shown, the stock state, and what the primary
// action acts on. Selection defaults to the first in-stock colourway so the
// primary action is live on arrival. (The redraw replaces the thumbnail strip
// and the swatch wall with the one select — the photograph and the SKU line
// are where a choice becomes visible.)
//
// Purchase action by type, in the redraw's own labels:
//   fabric        -> "Add to quote" (metres field), cut to order and priced by
//                    the back office; an out-of-stock colourway is added the
//                    same way and carries its lead-time note through to the
//                    request page, where the whole list is sent as ONE request.
//                    "Request a sample" sits beside it, landing on /contact.
//   finished good -> "Add to cart" (quantity field).
//
// THE TRADE GATE (lib/tradeGate.js) is why this island has a fourth status.
// Designs from the maisons Atelier represents are served only to approved trade
// and staff; everyone else gets 403 with `trade_only: true`. The page's server
// render is anonymous, so `tradeGated` means "gated for a signed-out visitor" —
// and this fetch, which does carry the cookie, is the one that can disagree.
// Both directions matter and both are handled here:
//   gated server-side, this fetch succeeds -> the shopper is entitled after
//     all, and the panel is replaced by the product (the reason the .astro
//     mounts the island on the gate page at all).
//   this fetch 403s -> the panel, not the generic error state. A 403 is an
//     answer, not a failure, and "We could not load this right now" would send
//     a shopper to refresh forever.
//
// Everything renders inside one component: the store's ESLint has no React
// plugin, so a JSX-only reference to a sub-component would trip no-unused-vars
// (see ProductLibrary.jsx, same constraint).

const SPEC_FIELDS = [
  // First, because on a finished good it is the thing a shopper is actually
  // choosing between: one product per size, so a bath sheet and a hand towel
  // are two products and this is what tells them apart. Absent on a fabric,
  // and the filter below drops a field the product does not carry.
  { key: 'size', label: 'Size' },
  { key: 'composition', label: 'Composition' },
  { key: 'width', label: 'Width' },
  { key: 'rubs', label: 'Rubs' },
  { key: 'application', label: 'Application' },
  { key: 'price_band', label: 'Price band' },
  { key: 'lead_time', label: 'Lead time' },
]

const MAX_QTY = 99

// Where the request list is reviewed and sent.
const REQUEST_PATH = '/order-request'

// How many cards the Similar strip shows (the mock's row).
const SIMILAR_LIMIT = 4

// The colourway a shopper should land on: the first one in stock, else the
// first one at all. Returns null for a product with no colourways.
function defaultColourway(colourways) {
  if (!colourways || colourways.length === 0) return null
  return colourways.find((colourway) => colourway.in_stock) || colourways[0]
}

export default function ProductDetail({ slug, initialProduct = null, tradeGated = false }) {
  const [product, setProduct] = useState(initialProduct)
  // Seeded pages start ready, so there is no loading flash and the server's
  // markup matches the client's first render (a mismatch would fail hydration).
  // A gated page starts on the panel for the same reason: server and client
  // both begin from the prop, and only the credentialed fetch may move it.
  const [status, setStatus] = useState(
    tradeGated ? 'gated' : initialProduct ? 'ready' : 'loading'
  )
  const [error, setError] = useState('')
  const [selectedSku, setSelectedSku] = useState(
    () => defaultColourway(initialProduct?.colourways)?.sku ?? null
  )
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(0) // how many were just added, 0 = nothing
  // Fabric is bought by the metre, decimal — this is a typed field held as text
  // until it is added.
  const [metres, setMetres] = useState('1')
  const [metresError, setMetresError] = useState('')
  const [requested, setRequested] = useState(0) // metres just added, 0 = nothing
  // Starts null so the client's first render matches the server's (which has no
  // cookie and therefore no viewer) — anything else fails hydration. Resolved
  // alongside the product below, and only ever selects price copy.
  const [viewer, setViewer] = useState(null)
  // The Similar strip: other designs from the same house, fetched once the
  // product (and its house) is known. Empty renders no section.
  const [similar, setSimilar] = useState([])

  const seeded = Boolean(initialProduct)

  // The hero crossfades on a colourway change. The outgoing image is painted as
  // the frame's background while the incoming <img> fades in over it, so no
  // second <img> and no extra state are needed — a ref written after render is
  // exactly "the previous render's hero".
  const previousHero = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([
      apiFetch(`/catalogue/products/${encodeURIComponent(slug)}`),
      // Resolved in the same round trip as the product so the price block never
      // flips copy after paint. Guarded because losing the viewer must not fail
      // the product fetch — it only costs a line of copy.
      fetchCurrentUser().catch(() => null),
    ])
      .then(([body, user]) => {
        if (!active) return
        // Detail endpoint wraps the product in an envelope: { product: {...} }.
        const loaded = body?.product ?? null
        setProduct(loaded)
        setViewer(user)
        // Keep the shopper's chosen colourway across the refresh; only fall
        // back to the default when that SKU is no longer listed.
        setSelectedSku((current) =>
          loaded?.colourways?.some((colourway) => colourway.sku === current)
            ? current
            : defaultColourway(loaded?.colourways)?.sku ?? null
        )
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        // A 403 carrying trade_only is the API's ANSWER, not a failure: this
        // shopper may not see this design. Show the invitation.
        if (isTradeGateError(err)) {
          setStatus('gated')
          return
        }
        // A seeded page is already showing the real product, and a gated page
        // is already showing the accurate reason it is not. A failed refresh
        // means stock and trade pricing may be stale — it does not mean the
        // product is gone, so it must not replace either with an error.
        if (seeded || tradeGated) return
        setError(err instanceof ApiError ? err.message : 'Unable to load this product.')
        setStatus('error')
      })
    return () => {
      active = false
    }
    // `seeded`, not `initialProduct` itself: a boolean is a stable dependency,
    // where an object prop would re-run this effect on any identity change.
  }, [slug, seeded, tradeGated])

  const brandSlug = product?.brand?.slug ?? null

  // The Similar strip. Same-house designs first; losing it costs a section,
  // never the page, so every failure collapses to an empty list.
  useEffect(() => {
    if (!brandSlug) {
      setSimilar([])
      return undefined
    }
    let active = true
    apiFetch(`/catalogue/products?brand=${encodeURIComponent(brandSlug)}&limit=${SIMILAR_LIMIT + 1}`)
      .then((body) => {
        if (!active) return
        const rows = Array.isArray(body?.products) ? body.products : []
        setSimilar(rows.filter((row) => row.slug !== slug).slice(0, SIMILAR_LIMIT))
      })
      .catch(() => {
        if (active) setSimilar([])
      })
    return () => {
      active = false
    }
  }, [brandSlug, slug])

  const colourways = useMemo(() => product?.colourways ?? [], [product])

  const selected = useMemo(
    () => colourways.find((colourway) => colourway.sku === selectedSku) ?? null,
    [colourways, selectedSku]
  )

  const anyInStock = useMemo(
    () => colourways.some((colourway) => colourway.in_stock),
    [colourways]
  )

  // Hero follows the selection, then any imaged colourway, then the hi-res asset.
  const heroImage = useMemo(
    () =>
      selected?.image_url ||
      colourways.find((colourway) => colourway.image_url)?.image_url ||
      product?.hi_res_asset_url ||
      null,
    [selected, colourways, product]
  )

  // Written after paint, so during the render that changes the hero the ref
  // still holds the outgoing image.
  useEffect(() => {
    previousHero.current = heroImage
  }, [heroImage])

  // Changing colourway invalidates the "added" confirmation — it refers to a
  // specific SKU.
  const chooseColourway = (sku) => {
    setSelectedSku(sku)
    setAdded(0)
    setRequested(0)
    setMetresError('')
  }

  // The gate. It borrows `.not-found`'s geometry and the same breadcrumb / h1 /
  // copy / action-row shape, because it is the same kind of page — a route that
  // resolved to something other than a product — and it must not read as an
  // error. Nothing here names the house or the design: the API sends neither,
  // deliberately.
  if (status === 'gated') {
    return (
      <div className="container detail-static">
        <div className="not-found trade-gate">
          <p className="breadcrumb">
            <a href="/products">← The Library</a>
          </p>
          <p className="badge-ochre">Trade library</p>
          <h1>{TRADE_GATE_COPY.design.heading}</h1>
          <p>{TRADE_GATE_COPY.design.body}</p>
          <div className="cta-row">
            <a className="cta-underline" href={TRADE_APPLICATION_PATH}>
              {TRADE_GATE_COPY.design.apply}
            </a>
            <a className="cta-underline" href={signInHref(`/products/${encodeURIComponent(slug)}`)}>
              {TRADE_GATE_COPY.design.signIn}
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return <p className="container detail-static products-status">Loading product…</p>
  }
  if (status === 'error') {
    return <p className="container detail-static error-state">{error}</p>
  }
  if (!product) {
    return <p className="container detail-static products-empty">This product is not available.</p>
  }

  const price = priceInfo(product, viewer)
  const fabric = isFabric(product)
  const specs = SPEC_FIELDS.filter(
    (field) => product[field.key] != null && product[field.key] !== ''
  )

  const heroWeave = weaveBackground(selected?.hex_tones ?? colourways[0]?.hex_tones)
  // The effect above writes this after paint, so here it is still the hero the
  // previous commit showed — the one to hold under the incoming image.
  const outgoingHero = previousHero.current

  const canAddToCart = !fabric && Boolean(selected?.in_stock)

  const onAddToCart = () => {
    if (!canAddToCart) return
    // The cart line carries the price THIS viewer was quoted, on the same
    // precedence priceInfo() renders (FR-3): the API only ever sends
    // `trade_price_cents` to an approved trade shopper, so its presence IS the
    // entitlement. Storing retail here made the card say "Trade $X" and the cart
    // say retail. Trade money is NZD cents whatever `product.currency` (the
    // supplier's, and the retail figure's) says. The API re-resolves the charge
    // on the same rule — this figure is never trusted for money.
    const tradePriceCents = product.trade_price_cents ?? null
    addToCart(
      {
        sku: selected.sku,
        name: product.name,
        colourway: selected.name,
        brand: product.brand?.name ?? null,
        slug: product.slug,
        image_url: selected.image_url ?? product.hi_res_asset_url ?? null,
        price_cents: tradePriceCents ?? product.retail_price_cents ?? null,
        currency: tradePriceCents == null ? product.currency : TRADE_CURRENCY,
      },
      qty
    )
    setAdded(qty)
  }

  // Fabric is added per colourway, with its stock state, so the request page
  // can decide whether the lead-time acceptance is required without re-deriving
  // it.
  const onAddToRequest = () => {
    if (!selected) return
    const wanted = normaliseMetres(metres)
    if (wanted === 0) {
      setMetresError('Enter the metres wanted (greater than 0).')
      return
    }
    setMetresError('')
    addToRequestList(
      {
        sku: selected.sku,
        slug: product.slug,
        name: product.name,
        brand: product.brand?.name ?? null,
        colourway: selected.name,
        image_url: selected.image_url ?? product.hi_res_asset_url ?? null,
        in_stock: selected.in_stock === true,
        lead_time: product.lead_time ?? null,
      },
      wanted
    )
    setRequested(wanted)
  }

  // The lede under the name. The mock writes the fabric flow's own explainer
  // there; a finished good has no equivalent copy, so it states the simpler
  // truth of that flow instead.
  const lede = fabric
    ? 'Cut to order by the metre. We confirm stock and batch shading before invoicing. Add as many cloths as you like and send them as one request.'
    : 'Dispatched from the Auckland workroom. Delivery details are collected securely at checkout.'

  return (
    <article className="product-detail">
      <div className="detail-band">
        <div className="detail-media">
          <div
            className="detail-hero-frame"
            style={
              outgoingHero
                ? { backgroundImage: `url(${outgoingHero})` }
                : heroWeave
                  ? { background: heroWeave }
                  : undefined
            }
          >
            {heroImage ? (
              <img
                key={heroImage}
                className="detail-hero"
                src={heroImage}
                alt={selected ? `${product.name} — ${selected.name}` : product.name}
              />
            ) : (
              <div
                className="detail-hero detail-hero-placeholder"
                style={heroWeave ? { background: heroWeave } : undefined}
                aria-hidden="true"
              />
            )}
          </div>

          {product.hi_res_asset_url && (
            <a className="detail-hires" href={product.hi_res_asset_url} download>
              Download hi-res image
            </a>
          )}
        </div>

        <div className="detail-info">
          <p className="detail-eyebrow">
            {productClassLabel(product)}
            {product.brand?.name && (
              <>
                <span className="detail-eyebrow-sep" aria-hidden="true">
                  |
                </span>
                {product.brand.slug ? (
                  <a href={`/brands/${product.brand.slug}`}>{product.brand.name}</a>
                ) : (
                  product.brand.name
                )}
              </>
            )}
          </p>

          <h1 className="detail-name">{product.name}</h1>

          {/* The office's own copy for this product, when it has written any.
              It sits ABOVE the flow lede rather than replacing it: that
              sentence explains how the thing is bought, which is still true
              whatever the description says. */}
          {product.description && <p className="detail-lede">{product.description}</p>}

          <p className="detail-lede">{lede}</p>

          <p className={price.muted ? 'detail-price muted' : 'detail-price'}>
            {price.label && <span className="detail-price-label">{price.label} </span>}
            {price.text}
            {!price.muted && fabric && <span className="detail-price-unit">/ m</span>}
            {price.retail && <s className="detail-price-retail">{price.retail}</s>}
            {price.indicative && <span className="indicative-note">Indicative</span>}
          </p>

          <div className="detail-controls">
            {fabric ? (
              <label className="detail-control">
                <span className="detail-control-label">Size</span>
                <span className="metres-field">
                  <input
                    type="number"
                    min={METRES_STEP}
                    max={MAX_METRES}
                    step={METRES_STEP}
                    inputMode="decimal"
                    value={metres}
                    aria-label="Metres wanted"
                    aria-invalid={metresError ? 'true' : undefined}
                    onChange={(event) => {
                      setMetres(event.target.value)
                      setMetresError('')
                      setRequested(0)
                    }}
                  />
                  <span className="metres-unit" aria-hidden="true">
                    m
                  </span>
                </span>
              </label>
            ) : (
              <label className="detail-control">
                <span className="detail-control-label">Quantity</span>
                <span className="metres-field">
                  <input
                    type="number"
                    min={1}
                    max={MAX_QTY}
                    step={1}
                    inputMode="numeric"
                    value={qty}
                    aria-label="Quantity"
                    onChange={(event) => {
                      const next = Math.floor(Number(event.target.value))
                      setQty(Number.isFinite(next) ? Math.min(MAX_QTY, Math.max(1, next)) : 1)
                      setAdded(0)
                    }}
                  />
                </span>
              </label>
            )}

            {colourways.length > 0 && (
              <label className="detail-control">
                <span className="detail-control-label">Colour</span>
                <span className="detail-colour-select">
                  <select
                    value={selectedSku ?? ''}
                    onChange={(event) => chooseColourway(event.target.value)}
                  >
                    {colourways.map((colourway) => (
                      <option key={colourway.sku} value={colourway.sku}>
                        {colourway.name}
                        {colourway.in_stock ? '' : ' — out of stock'}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            )}
          </div>

          {specs.length > 0 && (
            <dl className="detail-specs">
              {specs.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{String(product[field.key])}</dd>
                </div>
              ))}
            </dl>
          )}

          {selected && (
            <p className="detail-selected">
              {selected.name}
              <span className="detail-eyebrow-sep" aria-hidden="true">
                |
              </span>
              <span className="detail-selected-sku">{selected.sku}</span>
            </p>
          )}

          <div className="detail-actions">
            {fabric ? (
              <>
                <button
                  type="button"
                  className="action-fill"
                  onClick={onAddToRequest}
                  disabled={!selected}
                >
                  {selected && !selected.in_stock ? 'Add to backorder quote' : 'Add to quote'}
                </button>
                <a className="action-outline" href="/contact">
                  Request a sample
                </a>
              </>
            ) : (
              <button
                type="button"
                className="action-fill"
                onClick={onAddToCart}
                disabled={!canAddToCart}
              >
                Add to cart
              </button>
            )}
          </div>

          {metresError && <p className="field-error">{metresError}</p>}

          {fabric ? (
            <>
              {!selected ? (
                <p className="purchase-note">No colourway is listed to request.</p>
              ) : (
                !selected.in_stock && (
                  <p className="purchase-note">
                    {selected.name} is out of stock and will be backordered.{' '}
                    {product.lead_time
                      ? `Estimated lead time: ${product.lead_time}.`
                      : 'Lead time confirmed on request.'}
                    {anyInStock ? ' Another colourway is in stock.' : ''}
                  </p>
                )
              )}
              {requested > 0 && (
                <p className="purchase-added">
                  {requested} m × {selected?.name} added to your quote request.{' '}
                  <a href={REQUEST_PATH}>Review request</a>
                </p>
              )}
            </>
          ) : (
            <>
              {!selected && <p className="purchase-note">No colourway is listed to buy.</p>}
              {selected && !selected.in_stock && (
                <p className="purchase-note">
                  {selected.name} is out of stock.
                  {anyInStock ? ' Choose another colourway.' : ''}
                </p>
              )}
              {added > 0 && (
                <p className="purchase-added">
                  {added} × {selected?.name} added to your cart. <a href="/cart">View cart</a>
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <section className="container detail-similar" aria-label="Similar designs">
          <div className="detail-similar-head">
            <h2>Similar</h2>
            {brandSlug && (
              <a className="cta-underline cta-underline-lg" href={`/products?brand=${encodeURIComponent(brandSlug)}`}>
                View all
              </a>
            )}
          </div>
          <ul className="product-grid detail-similar-grid">
            {similar.map((row) => {
              const rowPrice = priceInfo(row, viewer)
              const weave = weaveBackground(row.colourways?.[0]?.hex_tones)
              return (
                <li key={row.slug} className="product-card">
                  <a href={`/products/${row.slug}`}>
                    <span className="product-media">
                      {row.image_url ? (
                        <img
                          className="product-image"
                          src={row.image_url}
                          alt={row.name}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="product-image-placeholder"
                          style={weave ? { background: weave } : undefined}
                          aria-hidden="true"
                        />
                      )}
                      <span className={row.in_stock ? 'product-stock in' : 'product-stock out'}>
                        {row.in_stock ? 'In stock' : 'Made to order'}
                      </span>
                    </span>
                    <span className="product-card-body">
                      <span className="product-brand">{row.brand?.name}</span>
                      <h3>{row.name}</h3>
                      <span className="product-specs">
                        {[productClassLabel(row), row.composition, row.width]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className={rowPrice.muted ? 'product-price muted' : 'product-price'}>
                        {rowPrice.label && (
                          <span className="detail-price-label">{rowPrice.label} </span>
                        )}
                        {rowPrice.text}
                      </span>
                    </span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </article>
  )
}
