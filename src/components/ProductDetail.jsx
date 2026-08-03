import { useEffect, useMemo, useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api.js'
import { fetchCurrentUser } from '../lib/auth.js'
import { addToCart } from '../lib/cart.js'
import { priceInfo, productTypeLabel, weaveBackground, isFabric } from '../lib/catalogue.js'
import { countWord } from '../lib/houses.js'

// Product detail island (US-018), Maison direction (design: "Maison Product").
// Fetches GET /catalogue/products/:slug for live availability and (for approved
// trade users) trade pricing.
//
// `initialProduct` is the same product already resolved server-side by
// products/[slug].astro. It is a SEED, not a replacement for the fetch: the
// server request carries no auth cookie, so it can never contain trade pricing,
// and stock moves. Seeding it means the server renders the real product markup
// (rather than "Loading product…") and the browser then refreshes it in place
// with the shopper's own view. The fetch is therefore still unconditional.
//
// Maison layout: 1.15fr/1fr, a 4/5 squared hero over 64px colourway thumbnails,
// and on the right a brass rule, a "Fabric · {House}" eyebrow, the display name
// with its last word in italic, the selected colourway block, the claret mono
// price, the action row, and the spec sheet as hairline rows. The colourway range
// repeats below as labelled tiles.
//
// The colourway is the thing actually bought — every SKU on this page belongs to
// a colourway, not the product — so selecting one drives the whole page: the
// hero image, the SKU shown, the stock state, and what "Add to cart" or
// "Request order" acts on. Selection defaults to the first in-stock colourway so
// the primary action is live on arrival.
//
// Purchase action by type:
//   finished good    -> Add to cart (quantity stepper)
//   fabric, in stock -> Request order (cut to order, priced by the back office)
//   fabric, no stock -> Request backorder, with the lead-time note
//
// Everything renders inside one component: the store's ESLint has no React
// plugin, so a JSX-only reference to a sub-component would trip no-unused-vars
// (see ProductLibrary.jsx, same constraint).

const SPEC_FIELDS = [
  { key: 'composition', label: 'Composition' },
  { key: 'width', label: 'Width' },
  { key: 'rubs', label: 'Rubs' },
  { key: 'application', label: 'Application' },
  { key: 'price_band', label: 'Price band' },
  { key: 'lead_time', label: 'Lead time' },
]

const MAX_QTY = 99

// The colourway a shopper should land on: the first one in stock, else the
// first one at all. Returns null for a product with no colourways.
function defaultColourway(colourways) {
  if (!colourways || colourways.length === 0) return null
  return colourways.find((colourway) => colourway.in_stock) || colourways[0]
}

// The redesign sets the last word of the display name in italic ("Ranfurly
// *Bouclé*"). A single-word name stays upright: italicising the whole thing
// reads as a different product rather than as an accent.
function splitDisplayName(name) {
  const words = String(name ?? '').trim().split(/\s+/)
  if (words.length < 2) return { head: name ?? '', tail: '' }
  return { head: words.slice(0, -1).join(' '), tail: words[words.length - 1] }
}

export default function ProductDetail({ slug, initialProduct = null }) {
  const [product, setProduct] = useState(initialProduct)
  // Seeded pages start ready, so there is no loading flash and the server's
  // markup matches the client's first render (a mismatch would fail hydration).
  const [status, setStatus] = useState(initialProduct ? 'ready' : 'loading')
  const [error, setError] = useState('')
  const [selectedSku, setSelectedSku] = useState(
    () => defaultColourway(initialProduct?.colourways)?.sku ?? null
  )
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(0) // how many were just added, 0 = nothing
  // Starts null so the client's first render matches the server's (which has no
  // cookie and therefore no viewer) — anything else fails hydration. Resolved
  // alongside the product below, and only ever selects price copy.
  const [viewer, setViewer] = useState(null)

  const seeded = Boolean(initialProduct)

  // The hero crossfades on a colourway change (design: ~.5s). The outgoing image
  // is painted as the frame's background while the incoming <img> fades in over
  // it, so no second <img> and no extra state are needed — a ref written after
  // render is exactly "the previous render's hero".
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
        // A seeded page is already showing the real product. A failed refresh
        // means stock and trade pricing may be stale — it does not mean the
        // product is gone, so it must not replace a working page with an error.
        if (seeded) return
        setError(err instanceof ApiError ? err.message : 'Unable to load this product.')
        setStatus('error')
      })
    return () => {
      active = false
    }
    // `seeded`, not `initialProduct` itself: a boolean is a stable dependency,
    // where an object prop would re-run this effect on any identity change.
  }, [slug, seeded])

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

  // Changing colourway invalidates the "added to cart" confirmation — it refers
  // to a specific SKU.
  const chooseColourway = (sku) => {
    setSelectedSku(sku)
    setAdded(0)
  }

  if (status === 'loading') {
    return <p className="products-status">Loading product…</p>
  }
  if (status === 'error') {
    return <p className="error-state">{error}</p>
  }
  if (!product) {
    return <p className="products-empty">This product is not available.</p>
  }

  const price = priceInfo(product, viewer)
  const fabric = isFabric(product)
  const displayName = splitDisplayName(product.name)
  const specs = SPEC_FIELDS.filter(
    (field) => product[field.key] != null && product[field.key] !== ''
  )

  const heroWeave = weaveBackground(selected?.hex_tones ?? colourways[0]?.hex_tones)
  // The effect above writes this after paint, so here it is still the hero the
  // previous commit showed — the one to hold under the incoming image.
  const outgoingHero = previousHero.current

  // Fabrics are requested per colourway, so carry the selection to the form.
  const requestHref = `/order-request?product=${encodeURIComponent(product.slug)}${
    selected ? `&sku=${encodeURIComponent(selected.sku)}` : ''
  }`

  const canAddToCart = !fabric && Boolean(selected?.in_stock)

  const onAddToCart = () => {
    if (!canAddToCart) return
    addToCart(
      {
        sku: selected.sku,
        name: product.name,
        colourway: selected.name,
        brand: product.brand?.name ?? null,
        slug: product.slug,
        image_url: selected.image_url ?? product.hi_res_asset_url ?? null,
        price_cents: product.retail_price_cents ?? null,
        currency: product.currency,
      },
      qty
    )
    setAdded(qty)
  }

  return (
    <article className="product-detail">
      <nav className="detail-breadcrumb">
        <a href="/products">← The Library</a>
        {product.brand?.slug && (
          <>
            {' · '}
            <a href={`/brands/${product.brand.slug}`}>{product.brand.name}</a>
          </>
        )}
      </nav>

      <div className="detail-grid">
        <div className="detail-media">
          <div className="detail-gallery">
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

            {colourways.length > 1 && (
              <div className="detail-thumbs" role="group" aria-label="Colourways">
                {colourways.map((colourway) => (
                  <button
                    key={colourway.sku}
                    type="button"
                    className={
                      colourway.sku === selectedSku
                        ? 'detail-thumb is-selected'
                        : 'detail-thumb'
                    }
                    aria-pressed={colourway.sku === selectedSku}
                    onClick={() => chooseColourway(colourway.sku)}
                    title={colourway.name}
                    style={
                      colourway.image_url
                        ? { backgroundImage: `url(${colourway.image_url})` }
                        : { background: weaveBackground(colourway.hex_tones) }
                    }
                  >
                    <span className="sr-only">{colourway.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {product.hi_res_asset_url && (
            <a className="detail-hires" href={product.hi_res_asset_url} download>
              Download hi-res image
            </a>
          )}
        </div>

        <div className="detail-info">
          <div className="brass-rule"></div>
          <p className="detail-type">
            {[productTypeLabel(product.product_type), product.brand?.name]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <h1 className="detail-name">
            {displayName.head}
            {displayName.tail && <em> {displayName.tail}</em>}
          </h1>

          {selected && (
            <p className="detail-colourway-name">
              {selected.name}
              <span className="detail-selected-sku">{selected.sku}</span>
            </p>
          )}

          <p className={price.muted ? 'detail-price muted' : 'detail-price'}>
            {price.label && <span className="detail-price-label">{price.label} </span>}
            {price.text}
            {!price.muted && fabric && <span className="detail-price-unit">/ metre</span>}
            {price.retail && <s className="detail-price-retail">{price.retail}</s>}
            {price.indicative && <span className="indicative-note">Indicative</span>}
          </p>

          <div className="purchase">
            {!fabric ? (
              <>
                <div className="qty-field">
                  <span className="sr-only" id={`qty-label-${product.slug}`}>
                    Quantity
                  </span>
                  <button
                    type="button"
                    className="qty-stepper"
                    onClick={() => setQty((current) => Math.max(1, current - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="qty-value" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    type="button"
                    className="qty-stepper"
                    onClick={() => setQty((current) => Math.min(MAX_QTY, current + 1))}
                    disabled={qty >= MAX_QTY}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onAddToCart}
                  disabled={!canAddToCart}
                >
                  Add to cart
                </button>

                {!selected && <p className="purchase-note">No colourway is listed to buy.</p>}
                {selected && !selected.in_stock && (
                  <p className="purchase-note">
                    {selected.name} is out of stock.
                    {anyInStock ? ' Choose another colourway above.' : ''}
                  </p>
                )}
                {added > 0 && (
                  <p className="purchase-added">
                    {added} × {selected?.name} added to your cart.{' '}
                    <a href="/cart">View cart</a>
                  </p>
                )}
              </>
            ) : anyInStock ? (
              <>
                <a className="btn btn-primary btn-lg" href={requestHref}>
                  Request order
                </a>
                <a className="link-cta" href="/contact">
                  Request a cutting
                </a>
                <p className="purchase-note">
                  Cut to order by the metre. We confirm stock and batch shading before
                  invoicing.
                </p>
              </>
            ) : (
              <>
                <a className="btn btn-primary btn-lg" href={`${requestHref}&backorder=1`}>
                  Request backorder
                </a>
                <a className="link-cta" href="/contact">
                  Request a cutting
                </a>
                <p className="purchase-note">
                  Currently out of stock.{' '}
                  {product.lead_time
                    ? `Estimated lead time: ${product.lead_time}.`
                    : 'Lead time confirmed on request.'}
                </p>
              </>
            )}
          </div>

          {specs.length > 0 && (
            <dl className="detail-specs spec-rows">
              {specs.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{String(product[field.key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <section className="detail-colourways">
        <p className="eyebrow-brass">The range</p>
        <h2>
          {countWord(colourways.length)} <em>{colourways.length === 1 ? 'colourway' : 'colourways'}</em>
        </h2>
        {colourways.length ? (
          <ul className="swatch-grid">
            {colourways.map((colourway) => {
              const classes = ['swatch']
              if (!colourway.in_stock) classes.push('swatch-out')
              if (colourway.sku === selectedSku) classes.push('is-selected')
              const weave = weaveBackground(colourway.hex_tones)
              return (
                <li key={colourway.sku} className={classes.join(' ')}>
                  <button type="button" onClick={() => chooseColourway(colourway.sku)}>
                    {colourway.image_url ? (
                      <img
                        className="swatch-image"
                        src={colourway.image_url}
                        alt={colourway.name}
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="swatch-tones"
                        style={weave ? { background: weave } : undefined}
                        aria-hidden="true"
                      />
                    )}
                    <span className="swatch-name">{colourway.name}</span>
                    <span className="detail-selected-sku">{colourway.sku}</span>
                    <span className={colourway.in_stock ? 'swatch-stock in' : 'swatch-stock out'}>
                      {colourway.in_stock ? 'In stock' : 'Out of stock'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="products-empty">No colourways listed for this product.</p>
        )}
      </section>
    </article>
  )
}
